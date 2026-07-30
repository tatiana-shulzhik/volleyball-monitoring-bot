import { Injectable, Logger } from '@nestjs/common';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { LeaguesRepository } from '../../databases/repositories/leagues.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { SynchronizedLeagues } from '../../interfaces/responses/synchronized-leagues.interface';
import { calculateLeagueChanges } from '../../shared/leagues.utils';
import {
  applyEntityChanges,
  logEntityChanges,
} from '../../shared/synchronization.utils';

@Injectable()
export class LeaguesService {
  private readonly logger = new Logger(LeaguesService.name);

  constructor(
    private readonly gateway: CevGateway,
    private readonly repository: LeaguesRepository,
  ) {}

  async synchronize(
    stages: CompetitionStagesEntity[],
  ): Promise<SynchronizedLeagues> {
    if (!stages.length) {
      this.logger.warn('No championships found; leagues sync skipped');
      return { leagues: [], teams: [], isComplete: true };
    }

    this.logger.log(
      `Starting leagues synchronization for ${stages.length} stages`,
    );

    const fetched = await this.gateway.fetchLeagueCatalog(stages);
    const existing = await this.repository.findByStageIds(
      stages.map(({ id }) => id),
    );
    const changes = calculateLeagueChanges({
      incoming: fetched.leagues,
      existing,
      stagesByExternalId: new Map(
        stages.map((stage) => [stage.externalId, stage]),
      ),
    });

    await applyEntityChanges({
      repository: this.repository,
      changes,
      allowDeletion: fetched.isComplete,
    });
    logEntityChanges({
      logger: this.logger,
      entityName: 'Leagues',
      changes,
      isComplete: fetched.isComplete,
      allowDeletion: true,
    });

    return {
      leagues: await this.repository.findByStageIds(stages.map(({ id }) => id)),
      teams: fetched.teams,
      isComplete: fetched.isComplete,
    };
  }
}
