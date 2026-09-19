import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { MatchEntity } from '../../databases/entities/match.entity';
import { CevGateway } from '../../gateway/cev.gateway';
import { IProcessLineupMatchParams } from '../../interfaces/requests/process-lineup-match-params.interface';
import { IProcessRosterMatchParams } from '../../interfaces/requests/process-roster-match-params.interface';
import { IFetchedMatchAttackStatistics } from '../../interfaces/requests/player-statistics.interface';
import {
  ILivePlayerMonitoringChange,
  IMonitoringContext,
  IPlayerMonitoringState,
  IStartingLineupMonitoringChange,
} from '../../interfaces/responses/match-player-monitoring.interface';
import {
  createMatchStatisticsUrl,
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
  addRosterStatistics,
  findLineupPlayer,
  formatLiveMonitoringMessage,
  formatFullMatchRosterMonitoringMessage,
  formatMatchRosterMonitoringMessage,
  formatStartingLineupMonitoringMessage,
  getCurrentSet,
  getMonitoredPlayers,
  getMonitoredRoster,
  getPlayerMonitoringStateKey,
  getPlayerMonitoringStateTtl,
  isActiveMark,
  isStarter,
} from '../../shared/match-roster-monitoring.utils';
import { MonitoringSubscriptionsService } from '../monitoring-subscriptions/monitoring-subscriptions.service';
import { TelegramService } from '../telegram/telegram.service';
import { MatchesService } from '../matches/matches.service';
import { PlayerTeamLeaguesService } from '../players/player-team-leagues.service';
import { PlayersService } from '../players/players.service';

/** Проверяет заявку, стартовый состав и live-статус игроков в матчах CEV. */
@Injectable()
export class MatchRosterMonitoringService {
  private readonly logger = new Logger(MatchRosterMonitoringService.name);
  constructor(
    private readonly matchesService: MatchesService,
    private readonly subscriptionsService: MonitoringSubscriptionsService,
    private readonly playerTeamLeaguesService: PlayerTeamLeaguesService,
    private readonly playersService: PlayersService,
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

  /** Проверяет стартовый состав каждую минуту в последние 10 минут до матча. */
  async checkStartingLineups(): Promise<number> {
    const now = new Date();
    // Матч проверяется с момента, когда до начала остаётся 10 минут, и до старта.
    const matches = await this.matchesService.findCevMonitoredWithin(
      now,
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
      (items) => this.gateway.fetchLiveMatchData(items),
      (match, data, context, now) =>
        this.processLiveMatch({
          match,
          lineup: data.lineup,
          attackStatistics: data.attackStatistics,
          context,
          now,
        }),
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
    const monitoredPlayers = getMonitoredPlayers(
      match,
      context,
      roster.home,
      roster.away,
    );
    const statesByPlayerId = await this.getStates(
      match,
      monitoredPlayers.map(({ subscription }) => subscription.playerId),
    );

    for (const { subscription, teamData: teamRoster } of monitoredPlayers) {
      if (!teamRoster.length) continue;

      const status = teamRoster.some(
        ({ externalId }) => externalId === subscription.player.externalId,
      )
        ? ERosterMonitoringStatus.Present
        : ERosterMonitoringStatus.Absent;
      const monitoring = statesByPlayerId.get(subscription.playerId) ?? {};
      if (monitoring.rosterStatus === status) continue;

      changedPlayers.push({
        playerId: subscription.playerId,
        playerName: subscription.player.fullName,
        status,
        monitoring,
      });
    }

    if (!changedPlayers.length) return 0;

    const notificationKey = this.getRosterNotificationKey(match, roster);
    const acquired = await this.cache.acquire(
      notificationKey,
      getPlayerMonitoringStateTtl(match, now),
    );
    if (!acquired) {
      this.logger.debug(
        `Duplicate roster notification skipped for CEV match ${match.externalId ?? match.id}`,
      );
      return 0;
    }

    const [homeStatistics, awayStatistics] = await Promise.all([
      this.playersService.findTeamStatistics({
        teamId: match.homeTeam.id,
        leagueId: match.league.id,
      }),
      this.playersService.findTeamStatistics({
        teamId: match.awayTeam.id,
        leagueId: match.league.id,
      }),
    ]);

    const home = addRosterStatistics(
      addRosterPositions(roster.home, match.homeTeam.id, context),
      homeStatistics?.players,
    );
    const away = addRosterStatistics(
      addRosterPositions(roster.away, match.awayTeam.id, context),
      awayStatistics?.players,
    );
    const monitored = getMonitoredPlayers(match, context, home, away);
    const monitoredHome = getMonitoredRoster(
      monitored,
      match.homeTeam.id,
      homeStatistics?.players,
    );
    const monitoredAway = getMonitoredRoster(
      monitored,
      match.awayTeam.id,
      awayStatistics?.players,
    );
    const message = {
      homeTeamName: match.homeTeam.name,
      awayTeamName: match.awayTeam.name,
      home,
      away,
      monitoredHome,
      monitoredAway,
      scheduledAt: match.scheduledAt,
      checkedAt: now,
    };
    const sent = await this.telegramService.sendRosterMonitoringNotification(
      formatMatchRosterMonitoringMessage(message),
      {
        fullHtml: formatFullMatchRosterMonitoringMessage(message),
        matchId: match.id,
      },
    );
    if (!sent) {
      await this.cache.delete(notificationKey);
      return 0;
    }

    changedPlayers.forEach(({ status, monitoring }) => {
      monitoring.rosterStatus = status;
    });
    await this.saveStates(match, changedPlayers, now);

    return 1;
  }

  private async processStartingLineupMatch(
    data: IProcessLineupMatchParams,
  ): Promise<number> {
    const { match, lineup, context, now } = data;
    const changedPlayers: IStartingLineupMonitoringChange[] = [];
    const monitoredPlayers = getMonitoredPlayers(
      match,
      context,
      lineup.home,
      lineup.away,
    );
    const statesByPlayerId = await this.getStates(
      match,
      monitoredPlayers.map(({ subscription }) => subscription.playerId),
    );

    for (const {
      subscription,
      relation,
      teamData: teamLineup,
    } of monitoredPlayers) {
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
      const monitoring = statesByPlayerId.get(subscription.playerId) ?? {};
      if (monitoring.startingStatus === status) continue;

      changedPlayers.push({
        playerId: subscription.playerId,
        status,
        monitoring,
      });
    }
    if (!changedPlayers.length) return 0;

    const sent = await this.telegramService.sendRosterMonitoringNotification(
      formatStartingLineupMonitoringMessage({
        homeTeamName: match.homeTeam.name,
        awayTeamName: match.awayTeam.name,
        home: lineup.home,
        away: lineup.away,
        homePositionsByShirtNumber: this.getPositionsByShirtNumber(
          match.homeTeam.id,
          match.league.id,
          context,
        ),
        awayPositionsByShirtNumber: this.getPositionsByShirtNumber(
          match.awayTeam.id,
          match.league.id,
          context,
        ),
        matchProtocolUrl: match.externalId
          ? createMatchStatisticsUrl(match.externalId)
          : undefined,
      }),
    );
    if (!sent) return 0;

    changedPlayers.forEach(({ status, monitoring }) => {
      monitoring.startingStatus = status;
    });
    await this.saveStates(match, changedPlayers, now);

    return 1;
  }

  private async processLiveMatch(
    data: IProcessLineupMatchParams & {
      attackStatistics: IFetchedMatchAttackStatistics;
    },
  ): Promise<number> {
    const { match, lineup, attackStatistics, context, now } = data;
    const currentSet = getCurrentSet(lineup.home, lineup.away);
    if (!currentSet) return 0;

    const changedPlayers: ILivePlayerMonitoringChange[] = [];
    const initialStates: ILivePlayerMonitoringChange[] = [];
    const monitoredPlayers = getMonitoredPlayers(
      match,
      context,
      lineup.home,
      lineup.away,
    );
    const statesByPlayerId = await this.getStates(
      match,
      monitoredPlayers.map(({ subscription }) => subscription.playerId),
    );
    for (const {
      subscription,
      relation,
      teamData: teamLineup,
    } of monitoredPlayers) {
      const player = findLineupPlayer(
        teamLineup,
        subscription.player.fullName,
        relation.shirtNumber,
      );
      const mark = player?.setMarks[currentSet - 1] ?? '';
      const status = isActiveMark(mark)
        ? ELivePlayerMonitoringStatus.Active
        : ELivePlayerMonitoringStatus.Inactive;
      const monitoring = statesByPlayerId.get(subscription.playerId) ?? {};

      // Первый live-снимок задаёт исходное состояние и не считается заменой.
      if (!monitoring.liveStatus) {
        if (status === ELivePlayerMonitoringStatus.Active) {
          changedPlayers.push({
            playerId: subscription.playerId,
            status,
            monitoring,
          });
        } else {
          monitoring.liveStatus = status;
          initialStates.push({
            playerId: subscription.playerId,
            status,
            monitoring,
          });
        }
        continue;
      }
      if (monitoring.liveStatus === status) continue;

      changedPlayers.push({
        playerId: subscription.playerId,
        status,
        monitoring,
      });
    }
    await this.saveStates(match, initialStates, now);
    if (!changedPlayers.length) return 0;

    const notificationKey = this.getLiveNotificationKey(
      match,
      lineup,
      currentSet,
    );
    const acquired = await this.cache.acquire(
      notificationKey,
      getPlayerMonitoringStateTtl(match, now),
    );
    if (!acquired) {
      this.logger.debug(
        `Duplicate live notification skipped for CEV match ${match.externalId ?? match.id}`,
      );
      return 0;
    }

    const sent = await this.telegramService.sendRosterMonitoringNotification(
      formatLiveMonitoringMessage({
        homeTeamName: match.homeTeam.name,
        awayTeamName: match.awayTeam.name,
        home: lineup.home,
        away: lineup.away,
        homeAttackStatistics: attackStatistics.home,
        awayAttackStatistics: attackStatistics.away,
        homePositionsByShirtNumber: this.getPositionsByShirtNumber(
          match.homeTeam.id,
          match.league.id,
          context,
        ),
        awayPositionsByShirtNumber: this.getPositionsByShirtNumber(
          match.awayTeam.id,
          match.league.id,
          context,
        ),
        currentSet,
        matchProtocolUrl: match.externalId
          ? createMatchStatisticsUrl(match.externalId)
          : undefined,
      }),
    );
    if (!sent) {
      await this.cache.delete(notificationKey);
      return 0;
    }

    changedPlayers.forEach(({ status, monitoring }) => {
      monitoring.liveStatus = status;
    });
    await this.saveStates(match, changedPlayers, now);

    return 1;
  }

  private getPositionsByShirtNumber(
    teamId: number,
    leagueId: number,
    context: IMonitoringContext,
  ): Map<number, string> {
    return new Map(
      [...context.relationsByPlayerAndLeague.values()].flatMap((relation) =>
        relation.team.id === teamId &&
        relation.league.id === leagueId &&
        relation.shirtNumber !== null &&
        relation.position
          ? [[relation.shirtNumber, relation.position] as const]
          : [],
      ),
    );
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

  private async getStates(
    match: MatchEntity,
    playerIds: number[],
  ): Promise<Map<number, IPlayerMonitoringState>> {
    const uniquePlayerIds = [...new Set(playerIds)];
    const keys = uniquePlayerIds.map((playerId) =>
      getPlayerMonitoringStateKey(match, playerId),
    );
    const statesByKey = await this.cache.getMany<IPlayerMonitoringState>(keys);

    return new Map(
      uniquePlayerIds.flatMap((playerId, index) => {
        const state = statesByKey.get(keys[index]);
        return state ? [[playerId, state] as const] : [];
      }),
    );
  }

  private getRosterNotificationKey(
    match: MatchEntity,
    roster: IProcessRosterMatchParams['roster'],
  ): string {
    const signature = [roster.home, roster.away]
      .map((team) =>
        [...team]
          .sort(
            (left, right) =>
              left.externalId.localeCompare(right.externalId) ||
              (left.shirtNumber ?? -1) - (right.shirtNumber ?? -1) ||
              (left.position ?? '').localeCompare(right.position ?? ''),
          )
          .map(
            ({ externalId, shirtNumber, position }) =>
              `${externalId}:${shirtNumber ?? ''}:${position ?? ''}`,
          )
          .join(','),
      )
      .join('|');
    const digest = createHash('sha256').update(signature).digest('hex');

    return `match-monitoring:${match.id}:roster-notification:${digest}`;
  }

  private getLiveNotificationKey(
    match: MatchEntity,
    lineup: IProcessLineupMatchParams['lineup'],
    currentSet: number,
  ): string {
    const signature = [lineup.home, lineup.away]
      .map((team) =>
        [...team]
          .sort(
            (left, right) =>
              (left.shirtNumber ?? -1) - (right.shirtNumber ?? -1) ||
              left.playerName.localeCompare(right.playerName),
          )
          .map(
            ({ playerName, shirtNumber, setMarks }) =>
              `${playerName}:${shirtNumber ?? ''}:${setMarks[currentSet - 1] ?? ''}`,
          )
          .join(','),
      )
      .join('|');
    const digest = createHash('sha256').update(signature).digest('hex');

    return `match-monitoring:${match.id}:live-notification:${currentSet}:${digest}`;
  }

  private saveStates(
    match: MatchEntity,
    states: Array<{
      playerId: number;
      monitoring: IPlayerMonitoringState;
    }>,
    now: Date,
  ): Promise<void> {
    const ttlSeconds = getPlayerMonitoringStateTtl(match, now);
    return this.cache.setMany(
      states.map(({ playerId, monitoring }) => ({
        key: getPlayerMonitoringStateKey(match, playerId),
        value: monitoring,
        ttlSeconds,
      })),
    );
  }
}
