import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { MatchEntity } from '../../databases/entities/match.entity';
import { MatchesRepository } from '../../databases/repositories/matches.repository';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import {
  IFetchedMatchLineup,
  IFetchedMatchRoster,
} from '../../interfaces/requests/player-statistics.interface';
import {
  IMonitoringContext,
  IPlayerMonitoringState,
} from '../../interfaces/responses/match-player-monitoring.interface';
import {
  LIVE_MONITORING_MAX_MATCH_AGE_HOURS,
  MATCH_ROSTER_CHECK_WINDOW_MINUTES,
  MATCH_STARTING_LINEUP_CHECK_WINDOW_MINUTES,
} from '../../shared/consts/constants';
import {
  ELivePlayerMonitoringStatus,
  ERosterMonitoringStatus,
  ESourceCode,
  EStartingLineupMonitoringStatus,
} from '../../shared/enums';
import {
  findLineupPlayer,
  formatLiveMonitoringMessage,
  formatRosterMonitoringMessage,
  formatStartingLineupMessage,
  getCurrentSet,
  getMonitoredPlayers,
  getPlayerMonitoringStateKey,
  getPlayerMonitoringStateTtl,
  isActiveMark,
  isStarter,
} from '../../shared/match-roster-monitoring.utils';
import { MonitoringSubscriptionsService } from '../monitoring-subscriptions/monitoring-subscriptions.service';
import { TelegramService } from '../telegram/telegram.service';

/** Проверяет заявку, стартовый состав и live-статус игроков в матчах CEV. */
@Injectable()
export class MatchRosterMonitoringService {
  private readonly logger = new Logger(MatchRosterMonitoringService.name);
  constructor(
    private readonly matchesRepository: MatchesRepository,
    private readonly subscriptionsService: MonitoringSubscriptionsService,
    private readonly relationsRepository: PlayerTeamLeaguesRepository,
    private readonly gateway: CevGateway,
    private readonly telegramService: TelegramService,
    private readonly cache: RedisCacheService,
  ) {}

  async checkUpcomingMatchRosters(): Promise<number> {
    const now = new Date();
    // Матч выбирается только в минуту проверки за 30 минут до начала.
    const matches = await this.matchesRepository.findCevMonitoredWithin(
      new Date(
        now.getTime() + (MATCH_ROSTER_CHECK_WINDOW_MINUTES - 1) * 60_000,
      ),
      new Date(now.getTime() + MATCH_ROSTER_CHECK_WINDOW_MINUTES * 60_000),
    );
    const notifications = await this.processMatches(
      matches,
      now,
      (items) => this.gateway.fetchMatchRosters(items),
      (match, roster, context, checkedAt) =>
        this.processRosterMatch(match, roster, context, checkedAt),
    );

    if (notifications) {
      this.logger.log(
        `Sent ${notifications} upcoming-match roster monitoring notification(s)`,
      );
    }

    return notifications;
  }

  /** Проверяет заявленный стартовый состав в последние 10 минут до матча. */
  async checkStartingLineups(): Promise<number> {
    const now = new Date();
    // Матч выбирается только в минуту проверки за 10 минут до начала.
    const matches = await this.matchesRepository.findCevMonitoredWithin(
      new Date(
        now.getTime() +
          (MATCH_STARTING_LINEUP_CHECK_WINDOW_MINUTES - 1) * 60_000,
      ),
      new Date(
        now.getTime() + MATCH_STARTING_LINEUP_CHECK_WINDOW_MINUTES * 60_000,
      ),
    );
    const notifications = await this.processMatches(
      matches,
      now,
      (items) => this.gateway.fetchMatchLineups(items),
      (match, lineup, context, checkedAt) =>
        this.processStartingLineupMatch(match, lineup, context, checkedAt),
    );

    if (notifications) {
      this.logger.log(
        `Sent ${notifications} starting-lineup monitoring notification(s)`,
      );
    }
    return notifications;
  }

  /** Опрашивает старый протокол CEV во время матча. */
  async monitorLiveMatches(): Promise<number> {
    const now = new Date();
    const matches = await this.matchesRepository.findCevMonitoredWithin(
      new Date(now.getTime() - LIVE_MONITORING_MAX_MATCH_AGE_HOURS * 3_600_000),
      now,
    );
    const notifications = await this.processMatches(
      matches,
      now,
      (items) => this.gateway.fetchMatchLineups(items),
      (match, lineup, context, checkedAt) =>
        this.processLiveMatch(match, lineup, context, checkedAt),
    );
    if (notifications) {
      this.logger.log(`Sent ${notifications} live monitoring notification(s)`);
    }
    return notifications;
  }

  private async processRosterMatch(
    match: MatchEntity,
    roster: IFetchedMatchRoster,
    context: IMonitoringContext,
    now: Date,
  ): Promise<number> {
    let notifications = 0;
    const notifiedPlayerNames: string[] = [];

    for (const {
      subscription,
      relation,
      teamData: teamRoster,
    } of getMonitoredPlayers(match, context, roster.home, roster.away)) {
      if (!teamRoster.length) continue;

      const status = teamRoster.some(
        ({ externalId }) => externalId === subscription.player.externalId,
      )
        ? ERosterMonitoringStatus.Present
        : ERosterMonitoringStatus.Absent;
      const monitoring = await this.getState(match, subscription.playerId);
      if (monitoring.rosterStatus === status) continue;

      const sent = await this.telegramService.sendRosterMonitoringNotification(
        formatRosterMonitoringMessage({
          status,
          playerName: subscription.player.fullName,
          shirtNumber: relation.shirtNumber,
          position: relation.position,
          teamName: relation.team.name,
          homeTeamName: match.homeTeam.name,
          awayTeamName: match.awayTeam.name,
          scheduledAt: match.scheduledAt,
          checkedAt: now,
        }),
      );
      if (!sent) continue;

      monitoring.rosterStatus = status;
      await this.saveState(match, subscription.playerId, monitoring, now);
      notifications++;
      notifiedPlayerNames.push(subscription.player.fullName);
    }

    if (notifiedPlayerNames.length) {
      this.logger.debug(
        `Match roster found for ${match.homeTeam.name} — ${match.awayTeam.name}: ` +
          `monitored players: ${notifiedPlayerNames.join(', ')}`,
      );
    }
    return notifications;
  }

  private async processStartingLineupMatch(
    match: MatchEntity,
    lineup: IFetchedMatchLineup,
    context: IMonitoringContext,
    now: Date,
  ): Promise<number> {
    let notifications = 0;

    for (const {
      subscription,
      relation,
      teamData: teamLineup,
    } of getMonitoredPlayers(match, context, lineup.home, lineup.away)) {
      if (!teamLineup.some((player) => player.setMarks.some(isActiveMark))) {
        continue;
      }

      const player = findLineupPlayer(
        teamLineup,
        subscription.player.fullName,
        relation.shirtNumber,
      );
      const status =
        player && isStarter(player.setMarks[0])
          ? EStartingLineupMonitoringStatus.Starter
          : EStartingLineupMonitoringStatus.Bench;
      const monitoring = await this.getState(match, subscription.playerId);
      if (monitoring.startingStatus === status) continue;

      const sent = await this.telegramService.sendRosterMonitoringNotification(
        formatStartingLineupMessage({
          status,
          playerName: subscription.player.fullName,
          shirtNumber: relation.shirtNumber,
          position: relation.position,
          teamName: relation.team.name,
          homeTeamName: match.homeTeam.name,
          awayTeamName: match.awayTeam.name,
        }),
      );
      if (!sent) continue;

      monitoring.startingStatus = status;
      await this.saveState(match, subscription.playerId, monitoring, now);
      notifications++;
    }
    return notifications;
  }

  private async processLiveMatch(
    match: MatchEntity,
    lineup: IFetchedMatchLineup,
    context: IMonitoringContext,
    now: Date,
  ): Promise<number> {
    const currentSet = getCurrentSet(lineup.home, lineup.away);
    if (!currentSet) return 0;

    let notifications = 0;
    for (const {
      subscription,
      relation,
      teamData: teamLineup,
    } of getMonitoredPlayers(match, context, lineup.home, lineup.away)) {
      const player = findLineupPlayer(
        teamLineup,
        subscription.player.fullName,
        relation.shirtNumber,
      );
      const mark = player?.setMarks[currentSet - 1] ?? '';
      const status = isActiveMark(mark)
        ? ELivePlayerMonitoringStatus.Active
        : ELivePlayerMonitoringStatus.Inactive;
      const monitoring = await this.getState(match, subscription.playerId);

      // Первый live-снимок задаёт исходное состояние и не считается заменой.
      if (!monitoring.liveStatus) {
        monitoring.liveStatus = status;
        await this.saveState(match, subscription.playerId, monitoring, now);
        continue;
      }
      if (monitoring.liveStatus === status) continue;

      const sent = await this.telegramService.sendRosterMonitoringNotification(
        formatLiveMonitoringMessage({
          status,
          playerName: subscription.player.fullName,
          shirtNumber: relation.shirtNumber,
          position: relation.position,
          teamName: relation.team.name,
          homeTeamName: match.homeTeam.name,
          awayTeamName: match.awayTeam.name,
          currentSet,
        }),
      );
      if (!sent) continue;

      monitoring.liveStatus = status;
      await this.saveState(match, subscription.playerId, monitoring, now);
      notifications++;
    }
    return notifications;
  }

  private async processMatches<T>(
    matches: MatchEntity[],
    now: Date,
    fetchData: (matches: MatchEntity[]) => Promise<PromiseSettledResult<T>[]>,
    handler: (
      match: MatchEntity,
      data: T,
      context: IMonitoringContext,
      now: Date,
    ) => Promise<number>,
  ): Promise<number> {
    const context = await this.getContext(matches);
    if (!context) return 0;

    const results = await fetchData(context.matches);
    let notifications = 0;

    for (const [index, result] of results.entries()) {
      if (result.status !== 'fulfilled') continue;

      notifications += await handler(
        context.matches[index],
        result.value,
        context,
        now,
      );
    }
    return notifications;
  }

  private async getContext(
    matches: MatchEntity[],
  ): Promise<IMonitoringContext | null> {
    if (!matches.length) return null;
    const subscriptions = await this.subscriptionsService.findAll(
      ESourceCode.Cev,
    );
    if (!subscriptions.length) return null;

    const subscriptionsByChampionship = new Map<number, typeof subscriptions>();
    for (const subscription of subscriptions) {
      const items =
        subscriptionsByChampionship.get(subscription.championshipId) ?? [];
      items.push(subscription);
      subscriptionsByChampionship.set(subscription.championshipId, items);
    }
    const relevantMatches = matches.filter(({ league }) =>
      subscriptionsByChampionship.has(league.stage.championship.id),
    );
    if (!relevantMatches.length) return null;

    const relations = await this.relationsRepository.getWhere({
      player: { id: In(subscriptions.map(({ playerId }) => playerId)) },
      league: { id: In(relevantMatches.map(({ league }) => league.id)) },
    });
    return {
      matches: relevantMatches,
      subscriptionsByChampionship,
      relationsByPlayerAndLeague: new Map(
        relations.map((relation) => [
          `${relation.player.id}:${relation.league.id}`,
          relation,
        ]),
      ),
    };
  }

  private getState(
    match: MatchEntity,
    playerId: number,
  ): Promise<IPlayerMonitoringState> {
    return this.cache
      .get<IPlayerMonitoringState>(getPlayerMonitoringStateKey(match, playerId))
      .then((state) => state ?? {});
  }

  private saveState(
    match: MatchEntity,
    playerId: number,
    state: IPlayerMonitoringState,
    now: Date,
  ): Promise<void> {
    return this.cache.set(
      getPlayerMonitoringStateKey(match, playerId),
      state,
      getPlayerMonitoringStateTtl(match, now),
    );
  }
}
