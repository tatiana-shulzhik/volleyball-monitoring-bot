import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { calculateStageChanges } from '../../shared/competition-stages.utils';
import {
  applyEntityChanges,
  logEntityChanges,
} from '../../shared/synchronization.utils';

@Injectable()
export class ChampionshipsService {
  private readonly logger = new Logger(ChampionshipsService.name);

  constructor(
    private readonly gateway: CevGateway,
    private readonly repository: CompetitionStagesRepository,
  ) {}

  async synchronize(
    championships: ChampionshipsEntity[],
  ): Promise<CompetitionStagesEntity[]> {
    if (!championships.length) {
      this.logger.warn('No championships found; stage sync skipped');
      return [];
    }

    const fetched = await this.gateway.fetchCompetitionStages(championships);
    const existing = await this.repository.getWhere({
      championship: { id: In(championships.map(({ id }) => id)) },
    });
    const changes = calculateStageChanges({
      incoming: fetched.stages,
      existing,
      championshipsByExternalId: new Map(
        championships.map((championship) => [
          championship.externalId,
          championship,
        ]),
      ),
    });

    await applyEntityChanges({
      repository: this.repository,
      changes,
      allowDeletion: fetched.isComplete,
    });
    logEntityChanges({
      logger: this.logger,
      entityName: 'Competition stages',
      changes,
      isComplete: fetched.isComplete,
      allowDeletion: true,
    });

    return this.repository.getWhere({
      championship: { id: In(championships.map(({ id }) => id)) },
    });
  }
}
