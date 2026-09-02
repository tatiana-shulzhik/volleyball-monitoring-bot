import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { LeaguesRepository } from '../../databases/repositories/leagues.repository';
import { MatchesRepository } from '../../databases/repositories/matches.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { ICevMatch } from '../../interfaces/requests/matches.interface';
import { IFetchedMatches } from '../../interfaces/requests/matches.interface';
import { MATCH_MONITORING_WINDOW_HOURS } from '../../shared/consts/constants';
import { calculateMatchChanges } from '../../shared/matches.utils';
import {
  applyEntityChanges,
  logEntityChanges,
} from '../../shared/synchronization.utils';
import { uniqueBy } from '../../shared/array.utils';
import { createLegaMatchLookupKey } from '../../shared/lega-volley.utils';
import { ESourceCode } from '../../shared/enums';
import { parseCevDate } from '../../shared/cev-matches.utils';
import { CEV_COUNTRIES } from '../../shared/consts/constants';
import { getErrorMessage } from '../../shared/error.utils';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly matchesRepository: MatchesRepository,
    private readonly leaguesRepository: LeaguesRepository,
    private readonly teamsRepository: TeamsRepository,
    private readonly teamLeaguesRepository: TeamLeaguesRepository,
  ) {}

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

    await this.matchesRepository.saveMany(
      resolved.map(({ match, league, homeTeam, awayTeam }) => {
        const stored = existingByKey.get(
          createLegaMatchLookupKey(
            league.externalId,
            homeTeam.name,
            awayTeam.name,
            match.scheduledAt,
          ),
        );

        return {
          id: stored?.id,
          externalId: stored?.externalId ?? match.externalId,
          league,
          homeTeam,
          awayTeam,
          scheduledAt: match.scheduledAt,
          monitoringStartedAt: stored?.monitoringStartedAt ?? null,
          attackStatisticsUpdatedAt: stored?.attackStatisticsUpdatedAt ?? null,
          status: match.status,
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

  async getFrequentlyRelevantStages(
    stages: CompetitionStagesEntity[],
  ): Promise<CompetitionStagesEntity[]> {
    const now = new Date();
    const currentStages = stages.filter(
      ({ startsAt, endsAt }) =>
        startsAt !== null &&
        endsAt !== null &&
        startsAt <= now &&
        endsAt >= now,
    );
    const completedIds = currentStages.length
      ? await this.matchesRepository.findCompletedStageIds(
          currentStages.map(({ id }) => id),
        )
      : [];
    const completed = new Set(completedIds);
    const relevant = stages.filter(
      ({ id, startsAt, endsAt }) =>
        startsAt !== null &&
        endsAt !== null &&
        endsAt >= now &&
        (startsAt > now || !completed.has(id)),
    );

    this.logger.log(
      `Frequent matches sync: ${relevant.length} of ` +
        `${stages.length} stages require refresh`,
    );

    return relevant;
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

      try {
        return {
          ...match,
          scheduledAt: parseCevDate(
            match.scheduledText ?? '',
            match.venue ?? '',
            countryCode,
          ),
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

  async startMonitoring(): Promise<number> {
    const now = new Date();
    const windowEnd = new Date(
      now.getTime() + MATCH_MONITORING_WINDOW_HOURS * 60 * 60 * 1000,
    );
    const started = await this.matchesRepository.startMonitoring(
      now,
      windowEnd,
    );

    if (started) {
      this.logger.log(`${started} matches entered the monitoring window`);
    }

    return started;
  }
}

function getCevCountryCode(
  country: string | null | undefined,
): string | undefined {
  if (!country) return undefined;

  return Object.entries(CEV_COUNTRIES).find(
    ([, name]) => name === country,
  )?.[0];
}
