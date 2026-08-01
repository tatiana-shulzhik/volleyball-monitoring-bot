import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { ICevCompetitionStage } from '../../interfaces/requests/competition-stages.interface';
import { SynchronizedSeasonCatalog } from '../../interfaces/responses/synchronized-season-catalog.interface';
import {
  calculateStageChanges,
  createCompetitionStageKey,
} from '../../shared/competition-stages.utils';
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
    catalog: SynchronizedSeasonCatalog,
  ): Promise<CompetitionStagesEntity[]> {
    const { championships, calendarStages, seasons } = catalog;

    if (!championships.length) {
      this.logger.warn('No championships found; stage sync skipped');
      return [];
    }

    const fetched = await this.gateway.fetchCompetitionStages(championships);
    const incoming = this.mergeStages(
      calendarStages,
      fetched.stages,
      fetched.isComplete,
    );
    const existing = await this.repository.getWhere({
      championship: { id: In(championships.map(({ id }) => id)) },
    });
    const changes = calculateStageChanges({
      incoming,
      existing,
      championshipsByExternalId: new Map(
        championships.map((championship) => [
          championship.externalId,
          championship,
        ]),
      ),
      seasonsByName: new Map(seasons.map((season) => [season.name, season])),
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

  private mergeStages(
    calendarStages: ICevCompetitionStage[],
    detailedStages: ICevCompetitionStage[],
    isComplete: boolean,
  ): ICevCompetitionStage[] {
    const calendarByKey = new Map(
      calendarStages.map((stage) => [
        createCompetitionStageKey(
          stage.championshipExternalId,
          stage.externalId,
        ),
        stage,
      ]),
    );
    const enrichedDetailedStages = detailedStages.map((stage) => {
      const calendarStage = calendarByKey.get(
        createCompetitionStageKey(
          stage.championshipExternalId,
          stage.externalId,
        ),
      );

      return {
        ...stage,
        startsAt: stage.startsAt ?? calendarStage?.startsAt,
        endsAt: stage.endsAt ?? calendarStage?.endsAt,
        seasonName: stage.seasonName ?? calendarStage?.seasonName,
      };
    });

    if (isComplete) {
      return enrichedDetailedStages;
    }

    return [
      ...new Map(
        [...calendarStages, ...enrichedDetailedStages].map((stage) => [
          createCompetitionStageKey(
            stage.championshipExternalId,
            stage.externalId,
          ),
          stage,
        ]),
      ).values(),
    ];
  }
}
