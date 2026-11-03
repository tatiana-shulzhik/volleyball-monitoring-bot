import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { LeaguesRepository } from '../../databases/repositories/leagues.repository';
import { MatchesRepository } from '../../databases/repositories/matches.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { CevGateway } from '../../gateway/cev.gateway';
import { LegaVolleyGateway } from '../../gateway/lega-volley.gateway';
import { LegaVolleyFemminileGateway } from '../../gateway/lega-volley-femminile.gateway';
import { ICevMatch } from '../../interfaces/requests/matches.interface';
import { IFetchedMatches } from '../../interfaces/requests/matches.interface';
import { IFetchedMatchRoster } from '../../interfaces/requests/player-statistics.interface';
import { IMatchRosterForDisplay } from '../../interfaces/responses/match-roster-display.interface';
import { IPlayerRosterSource } from '../../interfaces/responses/synchronized-teams.interface';
import { calculateMatchChanges } from '../../shared/matches.utils';
import {
  applyEntityChanges,
  logEntityChanges,
} from '../../shared/synchronization.utils';
import { uniqueBy } from '../../shared/array.utils';
import { createLegaMatchLookupKey } from '../../shared/lega-volley.utils';
import { addRosterStatistics } from '../../shared/match-roster-monitoring.utils';
import {
  getMatchUrl,
  toDisplayRoster,
} from '../../shared/telegram-today-matches.utils';
import { EMatchStatus, ESourceCode } from '../../shared/enums';
import { parseCevDate } from '../../shared/cev-matches.utils';
import {
  CEV_COUNTRIES,
  LIVE_MONITORING_MAX_MATCH_AGE_HOURS,
} from '../../shared/consts/constants';
import { getErrorMessage } from '../../shared/error.utils';
import { MatchEntity } from '../../databases/entities/match.entity';
import { PlayerTeamLeagueEntity } from '../../databases/entities/player-team-league.entity';
import { PlayerTeamLeaguesService } from '../players/player-team-leagues.service';
import { PlayersService } from '../players/players.service';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly matchesRepository: MatchesRepository,
    private readonly leaguesRepository: LeaguesRepository,
    private readonly teamsRepository: TeamsRepository,
    private readonly teamLeaguesRepository: TeamLeaguesRepository,
    private readonly playerTeamLeaguesService: PlayerTeamLeaguesService,
    private readonly playersService: PlayersService,
    private readonly cevGateway: CevGateway,
    private readonly legaVolleyGateway: LegaVolleyGateway,
    private readonly femminileGateway: LegaVolleyFemminileGateway,
  ) {}

  async getLegaMatchesWithSourceId(): Promise<Set<string>> {
    const matches = await this.matchesRepository.getWhere({
      league: {
        stage: { championship: { source: { code: ESourceCode.LegaVolley } } },
      },
    });
    return new Set(
      matches.flatMap((match) =>
        match.externalId && /^\d+$/.test(match.externalId)
          ? [
              createLegaMatchLookupKey(
                match.league.externalId,
                match.homeTeam.externalId,
                match.awayTeam.externalId,
                match.scheduledAt,
              ),
            ]
          : [],
      ),
    );
  }

  async getMatchRoster(matchId: number): Promise<{
    match: MatchEntity;
    homeRoster: PlayerTeamLeagueEntity[];
    awayRoster: PlayerTeamLeagueEntity[];
  } | null> {
    const [match] = await this.matchesRepository.getWhere({ id: matchId });
    if (!match) return null;

    const roster = await this.playerTeamLeaguesService.getMatchRosters(match);

    return {
      match,
      homeRoster: roster.home,
      awayRoster: roster.away,
    };
  }

  /** Заявка с сайта + статистика из БД; при ошибке сайта — состав из базы. */
  async getMatchRosterForDisplay(
    matchId: number,
  ): Promise<IMatchRosterForDisplay | null> {
    const [match] = await this.matchesRepository.getWhere({ id: matchId });
    if (!match) return null;

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

    const siteRoster = await this.fetchSiteMatchRoster(match);
    if (siteRoster && (siteRoster.home.length || siteRoster.away.length)) {
      return {
        match,
        homeRoster: addRosterStatistics(
          siteRoster.home,
          homeStatistics?.players,
        ),
        awayRoster: addRosterStatistics(
          siteRoster.away,
          awayStatistics?.players,
        ),
        homeStatistics,
        awayStatistics,
        source: 'site',
        matchUrl: getMatchUrl(match, siteRoster.sourceMatchId),
      };
    }

    const dbRoster = await this.playerTeamLeaguesService.getMatchRosters(match);
    return {
      match,
      homeRoster: addRosterStatistics(
        toDisplayRoster(dbRoster.home),
        homeStatistics?.players,
      ),
      awayRoster: addRosterStatistics(
        toDisplayRoster(dbRoster.away),
        awayStatistics?.players,
      ),
      homeStatistics,
      awayStatistics,
      source: 'database',
      matchUrl: getMatchUrl(match),
    };
  }

  private async fetchSiteMatchRoster(
    match: MatchEntity,
  ): Promise<IFetchedMatchRoster | null> {
    const sourceCode = match.league.stage.championship.source?.code;
    if (!sourceCode) return null;

    const fetchBySource: Partial<
      Record<
        ESourceCode,
        (
          matches: MatchEntity[],
        ) => Promise<PromiseSettledResult<IFetchedMatchRoster>[]>
      >
    > = {
      [ESourceCode.Cev]: (items) => this.cevGateway.fetchMatchRosters(items),
      [ESourceCode.LegaVolley]: (items) =>
        this.legaVolleyGateway.fetchMatchRosters(items),
      [ESourceCode.LegaVolleyFemminile]: (items) =>
        this.femminileGateway.fetchMatchRosters(items),
    };
    const fetchRosters = fetchBySource[sourceCode];
    if (!fetchRosters) return null;

    try {
      const [result] = await fetchRosters([match]);
      if (result?.status !== 'fulfilled') {
        this.logger.warn(
          `Site roster unavailable for match ${match.externalId ?? match.id}: ${
            result?.status === 'rejected'
              ? getErrorMessage(result.reason)
              : 'empty result'
          }`,
        );
        return null;
      }

      return result.value;
    } catch (error) {
      this.logger.warn(
        `Site roster request failed for match ${match.externalId ?? match.id}: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  async getCevMatchesWithRosterSources(stageIds?: number[]): Promise<{
    matches: MatchEntity[];
    sources: IPlayerRosterSource[];
  }> {
    if (stageIds?.length === 0) {
      return { matches: [], sources: [] };
    }

    const matches = (
      await this.matchesRepository.getWhere({
        league: {
          stage: {
            ...(stageIds ? { id: In(stageIds) } : {}),
            championship: { source: { code: ESourceCode.Cev } },
          },
        },
      })
    ).filter((match) => match.externalId);
    const sources = [
      ...new Map(
        matches.flatMap((match) =>
          [match.homeTeam, match.awayTeam].map((team) => [
            `${team.id}:${match.league.id}`,
            {
              team,
              league: match.league,
              championship: match.league.stage.championship,
            } satisfies IPlayerRosterSource,
          ]),
        ),
      ).values(),
    ];

    return { matches, sources };
  }

  async upsertCatalogMatches(
    incoming: ICevMatch[],
    leaguesByExternalId: Map<number, LeaguesEntity>,
    teamsByExternalId: Map<string, TeamEntity>,
    sourceCode = ESourceCode.LegaVolley,
  ): Promise<number> {
    const matches = uniqueBy(incoming, (match) => match.externalId);
    const resolved = matches.flatMap((match) => {
      const league = leaguesByExternalId.get(match.leagueExternalId);
      const homeTeam = teamsByExternalId.get(match.homeTeamExternalId);
      const awayTeam = teamsByExternalId.get(match.awayTeamExternalId);

      return league && homeTeam && awayTeam
        ? [{ match, league, homeTeam, awayTeam }]
        : [];
    });
    const existing = await this.matchesRepository.getWhere({
      league: {
        stage: { championship: { source: { code: sourceCode } } },
      },
    });
    const existingByKey = new Map(
      existing.map((match) => [
        createLegaMatchLookupKey(
          match.league.externalId,
          match.homeTeam.name,
          match.awayTeam.name,
          match.scheduledAt,
        ),
        match,
      ]),
    );
    const existingByExternalIdAndLeague = new Map(
      existing.flatMap((match) =>
        match.externalId
          ? [[`${match.externalId}:${match.league.id}`, match] as const]
          : [],
      ),
    );
    const pairKey = (leagueId: number, homeId: number, awayId: number) =>
      `${leagueId}:${homeId}:${awayId}`;
    const existingByPair = new Map<string, MatchEntity[]>();
    for (const match of existing) {
      const key = pairKey(
        match.league.id,
        match.homeTeam.id,
        match.awayTeam.id,
      );
      existingByPair.set(key, [...(existingByPair.get(key) ?? []), match]);
    }
    const incomingPairCounts = new Map<string, number>();
    for (const { league, homeTeam, awayTeam } of resolved) {
      const key = pairKey(league.id, homeTeam.id, awayTeam.id);
      incomingPairCounts.set(key, (incomingPairCounts.get(key) ?? 0) + 1);
    }

    await this.matchesRepository.saveMany(
      resolved.map(({ match, league, homeTeam, awayTeam }) => {
        const key = pairKey(league.id, homeTeam.id, awayTeam.id);
        const pairMatches = existingByPair.get(key) ?? [];
        const stored =
          (match.sourceMatchId
            ? existingByExternalIdAndLeague.get(
                `${match.sourceMatchId}:${league.id}`,
              )
            : undefined) ??
          existingByExternalIdAndLeague.get(
            `${match.externalId}:${league.id}`,
          ) ??
          existingByKey.get(
            createLegaMatchLookupKey(
              league.externalId,
              homeTeam.name,
              awayTeam.name,
              match.scheduledAt,
            ),
          ) ??
          (incomingPairCounts.get(key) === 1 && pairMatches.length === 1
            ? pairMatches[0]
            : undefined);

        return {
          id: stored?.id,
          externalId:
            match.sourceMatchId ?? stored?.externalId ?? match.externalId,
          league,
          homeTeam,
          awayTeam,
          scheduledAt: match.scheduledAt,
          attackStatisticsUpdatedAt: stored?.attackStatisticsUpdatedAt ?? null,
          status:
            sourceCode === ESourceCode.LegaVolleyFemminile
              ? resolveCevMatchStatus(match.status, match.scheduledAt)
              : match.status,
        };
      }),
    );
    const teamLeagues = uniqueBy(
      matches.flatMap((match) => {
        const league = leaguesByExternalId.get(match.leagueExternalId);
        const teams = [
          teamsByExternalId.get(match.homeTeamExternalId),
          teamsByExternalId.get(match.awayTeamExternalId),
        ];

        return league
          ? teams.flatMap((team) => (team ? [{ team, league }] : []))
          : [];
      }),
      ({ team, league }) => `${team.id}:${league.id}`,
    );
    if (teamLeagues.length) {
      await this.teamLeaguesRepository.updateMany(teamLeagues);
    }

    return resolved.length;
  }

  async synchronize(
    stages: CompetitionStagesEntity[],
    fetched: IFetchedMatches,
  ): Promise<void> {
    if (!stages.length) {
      this.logger.warn('No current championships found; matches sync skipped');
      return;
    }

    this.logger.log(
      `Starting matches synchronization for ${stages.length} stages`,
    );

    const leagueExternalIds = [
      ...new Set(
        fetched.matches.map(({ leagueExternalId }) => leagueExternalId),
      ),
    ];
    const teamExternalIds = [
      ...new Set(
        fetched.matches.flatMap(
          ({ homeTeamExternalId, awayTeamExternalId }) => [
            homeTeamExternalId,
            awayTeamExternalId,
          ],
        ),
      ),
    ];
    const matchExternalIds = fetched.matches.map(
      ({ externalId }) => externalId,
    );
    const [leagues, teams, existing] = await Promise.all([
      this.leaguesRepository.getWhere({
        externalId: In(leagueExternalIds),
        stage: { id: In(stages.map(({ id }) => id)) },
      }),
      this.teamsRepository.getWhere({
        externalId: In(teamExternalIds),
        source: { code: ESourceCode.Cev },
      }),
      this.matchesRepository.getWhere({
        externalId: In(matchExternalIds),
        league: { stage: { id: In(stages.map(({ id }) => id)) } },
      }),
    ]);
    const teamsByExternalId = new Map(
      teams.map((team) => [team.externalId, team]),
    );
    const changes = calculateMatchChanges({
      incoming: this.resolveCevMatchDates(fetched.matches, teamsByExternalId),
      existing,
      leaguesByExternalId: new Map(
        leagues.map((league) => [league.externalId, league]),
      ),
      teamsByExternalId,
    });

    await applyEntityChanges({
      repository: this.matchesRepository,
      changes,
      allowDeletion: false,
    });
    logEntityChanges({
      logger: this.logger,
      entityName: 'Matches',
      changes,
      isComplete: fetched.isComplete,
      allowDeletion: false,
    });
  }

  private resolveCevMatchDates(
    matches: ICevMatch[],
    teamsByExternalId: Map<string, TeamEntity>,
  ): ICevMatch[] {
    return matches.map((match) => {
      const countryCode =
        match.venueCountryCode ??
        getCevCountryCode(
          teamsByExternalId.get(match.homeTeamExternalId)?.country,
        );

      if (
        !/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(match.scheduledText ?? '')
      ) {
        return { ...match, scheduledAt: null };
      }

      try {
        const scheduledAt = parseCevDate(
          match.scheduledText ?? '',
          match.venue ?? '',
          countryCode,
        );

        return {
          ...match,
          scheduledAt,
          status: resolveCevMatchStatus(match.status, scheduledAt),
        };
      } catch (error) {
        this.logger.warn(
          `Unable to resolve timezone for CEV match ${match.externalId}: ` +
            getErrorMessage(error),
        );

        return match;
      }
    });
  }

  findCevMonitoredWithin(start: Date, end: Date): Promise<MatchEntity[]> {
    return this.findMonitoredWithin(ESourceCode.Cev, start, end);
  }

  findMonitoredWithin(
    sourceCode: ESourceCode,
    start: Date,
    end: Date,
  ): Promise<MatchEntity[]> {
    return this.matchesRepository.findMonitoredWithin(sourceCode, start, end);
  }
}

function resolveCevMatchStatus(
  status: EMatchStatus,
  scheduledAt: Date | null,
): EMatchStatus {
  if (
    status !== EMatchStatus.Scheduled ||
    !scheduledAt ||
    scheduledAt.getTime() >
      Date.now() - LIVE_MONITORING_MAX_MATCH_AGE_HOURS * 60 * 60 * 1_000
  ) {
    return status;
  }

  return EMatchStatus.Finished;
}

function getCevCountryCode(
  country: string | null | undefined,
): string | undefined {
  if (!country) return undefined;

  return Object.entries(CEV_COUNTRIES).find(
    ([, name]) => name === country,
  )?.[0];
}
