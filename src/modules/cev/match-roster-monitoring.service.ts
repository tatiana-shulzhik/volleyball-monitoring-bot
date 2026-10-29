import { Injectable, Logger } from '@nestjs/common';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { MatchEntity } from '../../databases/entities/match.entity';
import { CevGateway } from '../../gateway/cev.gateway';
import { LegaVolleyGateway } from '../../gateway/lega-volley.gateway';
import { LegaVolleyFemminileGateway } from '../../gateway/lega-volley-femminile.gateway';
import { IProcessLineupMatchParams } from '../../interfaces/requests/process-lineup-match-params.interface';
import { IProcessRosterMatchParams } from '../../interfaces/requests/process-roster-match-params.interface';
import {
  ICevMatchLineupPlayer,
  IFetchedMatchAttackStatistics,
} from '../../interfaces/requests/player-statistics.interface';
import {
  IMonitoringContext,
  IPlayerMonitoringState,
  IStartingLineupMonitoringChange,
} from '../../interfaces/responses/match-player-monitoring.interface';
import {
  createMatchProtocolUrl,
  LIVE_MONITORING_MAX_MATCH_AGE_HOURS,
  MATCH_MONITORING_WINDOW_HOURS,
  MATCH_STARTING_LINEUP_AFTER_START_MINUTES,
  MATCH_STARTING_LINEUP_CHECK_WINDOW_MINUTES,
} from '../../shared/consts/constants';
import {
  ERosterMonitoringStatus,
  ESourceCode,
  EStartingLineupMonitoringStatus,
} from '../../shared/enums';
import {
  addLineupStatistics,
  addRosterPositions,
  addRosterStatistics,
  findLineupPlayer,
  findRosterPlayer,
  formatLiveMonitoringMessage,
  formatFullMatchRosterMonitoringMessage,
  formatMatchRosterMonitoringMessage,
  formatStartingLineupMonitoringMessage,
  getCurrentSet,
  getAbsentStartingLineupPlayers,
  getLineupChanges,
  getLiveNotificationKey,
  getMonitoredLineupPlayers,
  getMonitoredPlayers,
  getMonitoredRoster,
  getPlayerMonitoringStateKey,
  getPlayerMonitoringStateTtl,
  getStartingLineupInMatchSentKey,
  getPositionsByShirtNumber,
  getRosterNotificationKey,
  isActiveMark,
  isStarter,
  mergeLineupSetMarksHistory,
  resolveMatchRosterExternalIds,
} from '../../shared/match-roster-monitoring.utils';
import { MonitoringSubscriptionsService } from '../monitoring-subscriptions/monitoring-subscriptions.service';
import { TelegramService } from '../telegram/telegram.service';
import { MatchesService } from '../matches/matches.service';
import { PlayerTeamLeaguesService } from '../players/player-team-leagues.service';
import { PlayersService } from '../players/players.service';

/** Проверяет заявку для CEV / Lega Volley / Femminile; live — все три; старт — Lega Volley + Femminile. */
@Injectable()
export class MatchRosterMonitoringService {
  private readonly logger = new Logger(MatchRosterMonitoringService.name);
  constructor(
    private readonly matchesService: MatchesService,
    private readonly subscriptionsService: MonitoringSubscriptionsService,
    private readonly playerTeamLeaguesService: PlayerTeamLeaguesService,
    private readonly playersService: PlayersService,
    private readonly gateway: CevGateway,
    private readonly legaVolleyGateway: LegaVolleyGateway,
    private readonly femminileGateway: LegaVolleyFemminileGateway,
    private readonly telegramService: TelegramService,
    private readonly cache: RedisCacheService,
  ) {}

  async checkUpcomingMatchRosters(): Promise<number> {
    const now = new Date();
    // Заявка проверяется каждые 10 минут в течение 36 часов до начала матча.
    const windowEnd = new Date(
      now.getTime() + MATCH_MONITORING_WINDOW_HOURS * 3_600_000,
    );
    const handleRoster = (
      match: MatchEntity,
      roster: IProcessRosterMatchParams['roster'],
      context: IMonitoringContext,
      checkedAt: Date,
    ) => this.processRosterMatch({ match, roster, context, now: checkedAt });
    const [cevNotifications, legaVolleyNotifications, femminileNotifications] =
      await Promise.all([
        this.processMatches(
          await this.matchesService.findMonitoredWithin(
            ESourceCode.Cev,
            now,
            windowEnd,
          ),
          now,
          (items) => this.gateway.fetchMatchRosters(items),
          handleRoster,
          ESourceCode.Cev,
        ),
        this.processMatches(
          await this.matchesService.findMonitoredWithin(
            ESourceCode.LegaVolley,
            now,
            windowEnd,
          ),
          now,
          (items) => this.legaVolleyGateway.fetchMatchRosters(items),
          handleRoster,
          ESourceCode.LegaVolley,
        ),
        this.processMatches(
          await this.matchesService.findMonitoredWithin(
            ESourceCode.LegaVolleyFemminile,
            now,
            windowEnd,
          ),
          now,
          (items) => this.femminileGateway.fetchMatchRosters(items),
          handleRoster,
          ESourceCode.LegaVolleyFemminile,
        ),
      ]);
    const notifications =
      cevNotifications + legaVolleyNotifications + femminileNotifications;

    if (notifications) {
      this.logger.log(
        `Sent ${notifications} upcoming-match roster monitoring notification(s)`,
      );
    }

    return notifications;
  }

  /**
   * Проверяет стартовый состав Lega Volley / Femminile:
   * за 10 минут до матча и после старта, пока не начался 2-й сет.
   * CEV не проверяем: стартовые составы появляются уже после начала матча.
   */
  async checkStartingLineups(): Promise<number> {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - MATCH_STARTING_LINEUP_AFTER_START_MINUTES * 60_000,
    );
    const windowEnd = new Date(
      now.getTime() + MATCH_STARTING_LINEUP_CHECK_WINDOW_MINUTES * 60_000,
    );
    const handleStartingLineup = (
      match: MatchEntity,
      lineup: IProcessLineupMatchParams['lineup'],
      context: IMonitoringContext,
      checkedAt: Date,
    ) =>
      this.processStartingLineupMatch({
        match,
        lineup,
        context,
        now: checkedAt,
      });
    const [legaVolleyNotifications, femminileNotifications] = await Promise.all(
      [
        this.processMatches(
          await this.matchesService.findMonitoredWithin(
            ESourceCode.LegaVolley,
            windowStart,
            windowEnd,
          ),
          now,
          (items) => this.legaVolleyGateway.fetchMatchLineups(items),
          handleStartingLineup,
          ESourceCode.LegaVolley,
        ),
        this.processMatches(
          await this.matchesService.findMonitoredWithin(
            ESourceCode.LegaVolleyFemminile,
            windowStart,
            windowEnd,
          ),
          now,
          (items) => this.femminileGateway.fetchMatchLineups(items),
          handleStartingLineup,
          ESourceCode.LegaVolleyFemminile,
        ),
      ],
    );
    const notifications = legaVolleyNotifications + femminileNotifications;

    if (notifications) {
      this.logger.log(
        `Sent ${notifications} starting-lineup monitoring notification(s)`,
      );
    }
    return notifications;
  }

  /** Опрашивает протокол матча, пока не истекло live-окно после местного старта. */
  async monitorLiveMatches(): Promise<number> {
    const now = new Date();
    const windowStart = new Date(
      now.getTime() - LIVE_MONITORING_MAX_MATCH_AGE_HOURS * 3_600_000,
    );
    const handleLiveMatch = (
      match: MatchEntity,
      data: {
        lineup: IProcessLineupMatchParams['lineup'];
        attackStatistics: IFetchedMatchAttackStatistics;
      },
      context: IMonitoringContext,
      checkedAt: Date,
    ) =>
      this.processLiveMatch({
        match,
        lineup: data.lineup,
        attackStatistics: data.attackStatistics,
        context,
        now: checkedAt,
      });
    const [cevNotifications, legaVolleyNotifications, femminileNotifications] =
      await Promise.all([
        this.processMatches(
          await this.matchesService.findMonitoredWithin(
            ESourceCode.Cev,
            windowStart,
            now,
          ),
          now,
          (items) => this.gateway.fetchLiveMatchData(items),
          handleLiveMatch,
          ESourceCode.Cev,
        ),
        this.processMatches(
          await this.matchesService.findMonitoredWithin(
            ESourceCode.LegaVolley,
            windowStart,
            now,
          ),
          now,
          (items) => this.legaVolleyGateway.fetchLiveMatchData(items),
          handleLiveMatch,
          ESourceCode.LegaVolley,
        ),
        this.processMatches(
          await this.matchesService.findMonitoredWithin(
            ESourceCode.LegaVolleyFemminile,
            windowStart,
            now,
          ),
          now,
          (items) => this.femminileGateway.fetchLiveMatchData(items),
          handleLiveMatch,
          ESourceCode.LegaVolleyFemminile,
        ),
      ]);
    const notifications =
      cevNotifications + legaVolleyNotifications + femminileNotifications;
    if (notifications) {
      this.logger.log(`Sent ${notifications} live monitoring notification(s)`);
    }
    return notifications;
  }

  private async processRosterMatch(
    data: IProcessRosterMatchParams,
  ): Promise<number> {
    const { match, context, now } = data;
    const roster = {
      ...data.roster,
      home: resolveMatchRosterExternalIds(
        data.roster.home,
        match.homeTeam.id,
        match.league.id,
        context,
      ),
      away: resolveMatchRosterExternalIds(
        data.roster.away,
        match.awayTeam.id,
        match.league.id,
        context,
      ),
    };
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

    for (const {
      subscription,
      relation,
      teamData: teamRoster,
    } of monitoredPlayers) {
      if (!teamRoster.length) continue;

      const status = findRosterPlayer(
        teamRoster,
        subscription.player.fullName,
        subscription.player.externalId,
        relation.shirtNumber,
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

    const changedPlayerIds = changedPlayers.map(({ playerId }) => playerId);
    const notificationKey = getRosterNotificationKey(
      match,
      roster,
      changedPlayerIds,
    );
    const acquired = await this.cache.acquire(
      notificationKey,
      getPlayerMonitoringStateTtl(match, now),
    );
    if (!acquired) {
      this.logger.debug(
        `Duplicate roster notification skipped for match ${match.externalId ?? match.id}`,
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
      championshipName: match.league.stage.championship.name,
      stageName: match.league.stage.name,
      leagueName: match.league.name,
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
    const currentSet = getCurrentSet(lineup.home, lineup.away);
    if (currentSet !== null && currentSet >= 2) return 0;

    const matchStarted =
      (currentSet !== null && currentSet >= 1) ||
      (match.scheduledAt !== null &&
        match.scheduledAt.getTime() <= now.getTime());
    const inMatchSentKey = getStartingLineupInMatchSentKey(match);
    const ttlSeconds = getPlayerMonitoringStateTtl(match, now);
    if (matchStarted) {
      const alreadySent = await this.cache.get<boolean>(inMatchSentKey);
      if (alreadySent) return 0;
    }

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

    const homePositionsByShirtNumber = getPositionsByShirtNumber(
      match.homeTeam.id,
      match.league.id,
      context,
    );
    const awayPositionsByShirtNumber = getPositionsByShirtNumber(
      match.awayTeam.id,
      match.league.id,
      context,
    );
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
    const sent = await this.telegramService.sendRosterMonitoringNotification(
      formatStartingLineupMonitoringMessage({
        championshipName: match.league.stage.championship.name,
        stageName: match.league.stage.name,
        leagueName: match.league.name,
        homeTeamName: match.homeTeam.name,
        awayTeamName: match.awayTeam.name,
        home: addLineupStatistics(lineup.home, homeStatistics?.players),
        away: addLineupStatistics(lineup.away, awayStatistics?.players),
        absentHome: getAbsentStartingLineupPlayers(
          monitoredPlayers,
          match.homeTeam.id,
          homePositionsByShirtNumber,
        ),
        absentAway: getAbsentStartingLineupPlayers(
          monitoredPlayers,
          match.awayTeam.id,
          awayPositionsByShirtNumber,
        ),
        homePositionsByShirtNumber,
        awayPositionsByShirtNumber,
        matchProtocolUrl: createMatchProtocolUrl(
          match.league.stage.championship.source?.code,
          match.externalId,
        ),
      }),
    );
    if (!sent) return 0;

    changedPlayers.forEach(({ status, monitoring }) => {
      monitoring.startingStatus = status;
    });
    await this.saveStates(match, changedPlayers, now);
    if (matchStarted) {
      await this.cache.set(inMatchSentKey, true, ttlSeconds);
    }

    return 1;
  }

  private async processLiveMatch(
    data: IProcessLineupMatchParams & {
      attackStatistics: IFetchedMatchAttackStatistics;
    },
  ): Promise<number> {
    const { match, attackStatistics, context, now } = data;
    const currentSet = getCurrentSet(data.lineup.home, data.lineup.away);
    if (!currentSet) return 0;

    const isFemminile =
      match.league.stage.championship.source?.code ===
      ESourceCode.LegaVolleyFemminile;
    const lineup = isFemminile
      ? await this.resolveLiveLineupHistory(match, data.lineup, currentSet, now)
      : data.lineup;

    const monitoredPlayers = getMonitoredPlayers(
      match,
      context,
      lineup.home,
      lineup.away,
    );
    if (!monitoredPlayers.length) return 0;

    const lineupKey = `match-monitoring:${match.id}:live-lineup`;
    const lineupTtl = getPlayerMonitoringStateTtl(match, now);
    const previous = await this.cache.get<{
      set: number;
      home: ICevMatchLineupPlayer[];
      away: ICevMatchLineupPlayer[];
    }>(lineupKey);
    const snapshot = {
      set: currentSet,
      home: getMonitoredLineupPlayers(
        monitoredPlayers,
        match.homeTeam.id,
        lineup.home,
      ),
      away: getMonitoredLineupPlayers(
        monitoredPlayers,
        match.awayTeam.id,
        lineup.away,
      ),
    };
    if (!previous) {
      await this.cache.set(lineupKey, snapshot, lineupTtl);
      return 0;
    }

    const previousHome = getMonitoredLineupPlayers(
      monitoredPlayers,
      match.homeTeam.id,
      previous.home,
    );
    const previousAway = getMonitoredLineupPlayers(
      monitoredPlayers,
      match.awayTeam.id,
      previous.away,
    );
    const changes = [
      getLineupChanges(
        match.homeTeam.name,
        previousHome,
        previous.set,
        snapshot.home,
        currentSet,
      ),
      getLineupChanges(
        match.awayTeam.name,
        previousAway,
        previous.set,
        snapshot.away,
        currentSet,
      ),
    ].flatMap((group) => (group ? [group] : []));
    if (!changes.length) {
      await this.cache.set(lineupKey, snapshot, lineupTtl);
      return 0;
    }

    const notificationKey = getLiveNotificationKey(match, snapshot, currentSet);
    const acquired = await this.cache.acquire(notificationKey, lineupTtl);
    if (!acquired) {
      await this.cache.set(lineupKey, snapshot, lineupTtl);
      return 0;
    }

    const sent = await this.telegramService.sendRosterMonitoringNotification(
      formatLiveMonitoringMessage({
        championshipName: match.league.stage.championship.name,
        stageName: match.league.stage.name,
        leagueName: match.league.name,
        homeTeamName: match.homeTeam.name,
        awayTeamName: match.awayTeam.name,
        home: lineup.home,
        away: lineup.away,
        homeAttackStatistics: attackStatistics.home,
        awayAttackStatistics: attackStatistics.away,
        homePositionsByShirtNumber: getPositionsByShirtNumber(
          match.homeTeam.id,
          match.league.id,
          context,
        ),
        awayPositionsByShirtNumber: getPositionsByShirtNumber(
          match.awayTeam.id,
          match.league.id,
          context,
        ),
        changes,
        currentSet,
        matchProtocolUrl: createMatchProtocolUrl(
          match.league.stage.championship.source?.code,
          match.externalId,
        ),
      }),
    );
    if (!sent) {
      await this.cache.delete(notificationKey);
      return 0;
    }

    await this.cache.set(lineupKey, snapshot, lineupTtl);

    return 1;
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
    sourceCode = ESourceCode.Cev,
  ): Promise<number> {
    const context = await this.getContext(matches, sourceCode);
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
    sourceCode = ESourceCode.Cev,
  ): Promise<IMonitoringContext | null> {
    if (!matches.length) return null;
    const subscriptions = await this.subscriptionsService.findAll(sourceCode);
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

  private async resolveLiveLineupHistory(
    match: MatchEntity,
    lineup: IProcessLineupMatchParams['lineup'],
    currentSet: number,
    now: Date,
  ): Promise<IProcessLineupMatchParams['lineup']> {
    const historyKey = `match-monitoring:${match.id}:lineup-set-marks`;
    const previous = await this.cache.get<{
      home: ICevMatchLineupPlayer[];
      away: ICevMatchLineupPlayer[];
    }>(historyKey);
    const home = mergeLineupSetMarksHistory(
      previous?.home,
      lineup.home,
      currentSet,
    );
    const away = mergeLineupSetMarksHistory(
      previous?.away,
      lineup.away,
      currentSet,
    );

    await this.cache.set(
      historyKey,
      { home, away },
      getPlayerMonitoringStateTtl(match, now),
    );

    return { ...lineup, home, away };
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
