import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { LeaguesRepository } from '../../databases/repositories/leagues.repository';
import { MatchesRepository } from '../../databases/repositories/matches.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { MATCH_MONITORING_WINDOW_HOURS } from '../../shared/consts/constants';
import { calculateMatchChanges } from '../../shared/matches.utils';
import {
  applyEntityChanges,
  logEntityChanges,
} from '../../shared/synchronization.utils';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly gateway: CevGateway,
    private readonly matchesRepository: MatchesRepository,
    private readonly leaguesRepository: LeaguesRepository,
    private readonly teamsRepository: TeamsRepository,
  ) {}

  async synchronize(stages: CompetitionStagesEntity[]): Promise<void> {
    if (!stages.length) {
      this.logger.warn('No current championships found; matches sync skipped');
      return;
    }

    this.logger.log(
      `Starting matches synchronization for ${stages.length} stages`,
    );

    const fetched = await this.gateway.fetchMatches(stages);
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
      }),
      this.teamsRepository.getWhere({ externalId: In(teamExternalIds) }),
      this.matchesRepository.getWhere({ externalId: In(matchExternalIds) }),
    ]);
    const changes = calculateMatchChanges({
      incoming: fetched.matches,
      existing,
      leaguesByExternalId: new Map(
        leagues.map((league) => [league.externalId, league]),
      ),
      teamsByExternalId: new Map(teams.map((team) => [team.externalId, team])),
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

  async synchronizeFrequently(
    stages: CompetitionStagesEntity[],
  ): Promise<void> {
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

    await this.synchronize(relevant);
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
