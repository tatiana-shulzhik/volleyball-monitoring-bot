import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { MatchEntity } from '../../databases/entities/match.entity';
import { CevGateway } from '../../gateway/cev.gateway';
import { IProcessLineupMatchParams } from '../../interfaces/requests/process-lineup-match-params.interface';
import { IProcessRosterMatchParams } from '../../interfaces/requests/process-roster-match-params.interface';
import {
  IMonitoringContext,
  IPlayerMonitoringState,
} from '../../interfaces/responses/match-player-monitoring.interface';
import {
  LIVE_MONITORING_MAX_MATCH_AGE_HOURS,
  MATCH_MONITORING_WINDOW_HOURS,
  MATCH_STARTING_LINEUP_CHECK_WINDOW_MINUTES,
} from '../../shared/consts/constants';
import {
  ELivePlayerMonitoringStatus,
  ERosterMonitoringStatus,
  ESourceCode,
  EStartingLineupMonitoringStatus,
} from '../../shared/enums';
import {
  addRosterPositions,
  findLineupPlayer,
  formatLiveMonitoringMessage,
  formatMatchRosterMonitoringMessage,
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
import { MatchesService } from '../matches/matches.service';
import { PlayerTeamLeaguesService } from '../players/player-team-leagues.service';

/** Проверяет заявку, стартовый состав и live-статус игроков в матчах CEV. */
@Injectable()
export class MatchRosterMonitoringService {
  private readonly logger = new Logger(MatchRosterMonitoringService.name);
  constructor(
    private readonly matchesService: MatchesService,
    private readonly subscriptionsService: MonitoringSubscriptionsService,
    private readonly playerTeamLeaguesService: PlayerTeamLeaguesService,
    private readonly gateway: CevGateway,
    private readonly telegramService: TelegramService,
    private readonly cache: RedisCacheService,
  ) {}

  async checkUpcomingMatchRosters(): Promise<number> {
    const now = new Date();
    // Заявка проверяется каждые 30 минут в течение 36 часов до начала матча.
    const matches = await this.matchesService.findCevMonitoredWithin(
      now,
      new Date(now.getTime() + MATCH_MONITORING_WINDOW_HOURS * 3_600_000),
    );
    const notifications = await this.processMatches(
      matches,
      now,
      (items) => this.gateway.fetchMatchRosters(items),
      (match, roster, context, checkedAt) =>
        this.processRosterMatch({ match, roster, context, now: checkedAt }),
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
    const matches = await this.matchesService.findCevMonitoredWithin(
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
      (match, lineup, context, now) =>
        this.processStartingLineupMatch({ match, lineup, context, now }),
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
    const matches = await this.matchesService.findCevMonitoredWithin(
      new Date(now.getTime() - LIVE_MONITORING_MAX_MATCH_AGE_HOURS * 3_600_000),
      now,
    );
    const notifications = await this.processMatches(
      matches,
      now,
      (items) => this.gateway.fetchMatchLineups(items),
      (match, lineup, context, now) =>
        this.processLiveMatch({ match, lineup, context, now }),
    );
    if (notifications) {
      this.logger.log(`Sent ${notifications} live monitoring notification(s)`);
    }
    return notifications;
  }

  private async processRosterMatch(
    data: IProcessRosterMatchParams,
  ): Promise<number> {
    const { match, roster, context, now } = data;
    const changedPlayers: Array<{
      playerId: number;
      playerName: string;
      status: ERosterMonitoringStatus;
      monitoring: IPlayerMonitoringState;
    }> = [];

    for (const { subscription, teamData: teamRoster } of getMonitoredPlayers(
      match,
      context,
      roster.home,
      roster.away,
    )) {
      if (!teamRoster.length) continue;

      const status = teamRoster.some(
        ({ externalId }) => externalId === subscription.player.externalId,
      )
        ? ERosterMonitoringStatus.Present
        : ERosterMonitoringStatus.Absent;
      const monitoring = await this.getState(match, subscription.playerId);
      if (monitoring.rosterStatus === status) continue;

      changedPlayers.push({
        playerId: subscription.playerId,
        playerName: subscription.player.fullName,
        status,
        monitoring,
      });
    }

    if (!changedPlayers.length) return 0;

    const sent = await this.telegramService.sendRosterMonitoringNotification(
      formatMatchRosterMonitoringMessage({
        homeTeamName: match.homeTeam.name,
        awayTeamName: match.awayTeam.name,
        home: addRosterPositions(roster.home, match.homeTeam.id, context),
        away: addRosterPositions(roster.away, match.awayTeam.id, context),
        scheduledAt: match.scheduledAt,
        checkedAt: now,
      }),
    );
    if (!sent) return 0;

    for (const { playerId, status, monitoring } of changedPlayers) {
      monitoring.rosterStatus = status;
      await this.saveState(match, playerId, monitoring, now);
    }

    return 1;
  }

  private async processStartingLineupMatch(
    data: IProcessLineupMatchParams,
  ): Promise<number> {
    const { match, lineup, context, now } = data;
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
    data: IProcessLineupMatchParams,
  ): Promise<number> {
    const { match, lineup, context, now } = data;
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

    const relations =
      await this.playerTeamLeaguesService.getForMatches(relevantMatches);
    return {
      matches: relevantMatches,
      subscriptionsByChampionship,
      relationsByPlayerAndLeague: new Map(
        relations.map((relation) => [
          `${relation.player.id}:${relation.league.id}`,
          relation,
        ]),
      ),
      positionsByTeamAndPlayer: new Map(
        relations.flatMap(({ team, player, position }) =>
          position
            ? [[`${team.id}:${player.externalId}`, position] as const]
            : [],
        ),
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
