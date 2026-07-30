import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { ISeason } from '../../interfaces/requests/seasons.interface';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import { calculateChampionshipChanges } from '../../shared/championships.utils';
import { calculateStageChanges } from '../../shared/competition-stages.utils';
import {
  applyEntityChanges,
  logEntityChanges,
} from '../../shared/synchronization.utils';

@Injectable()
export class SeasonsService {
  private readonly logger = new Logger(SeasonsService.name);

  constructor(
    private readonly gateway: CevGateway,
    private readonly seasonsRepository: SeasonsRepository,
    private readonly championshipsRepository: ChampionshipsRepository,
    private readonly stagesRepository: CompetitionStagesRepository,
  ) {}

  discoverCurrentAndFutureSeasons(): Promise<ChampionshipsEntity[]> {
    return this.synchronizeFrom(new Date().getFullYear());
  }

  synchronizeStoredRange(): Promise<ChampionshipsEntity[]> {
    return this.synchronizeFrom(
      new Date().getFullYear() - PREVIOUS_YEARS_COUNT,
    );
  }

  private async synchronizeFrom(
    earliestSeasonYear: number,
  ): Promise<ChampionshipsEntity[]> {
    this.logger.log(
      `Starting season catalog synchronization from ${earliestSeasonYear}`,
    );
    const fetched =
      await this.gateway.fetchSeasonCatalogSince(earliestSeasonYear);
    const incomingStages = fetched.stages.filter(
      ({ seasonName }) => Number(seasonName) >= earliestSeasonYear,
    );
    const championshipExternalIds = new Set(
      incomingStages.map(
        ({ championshipExternalId }) => championshipExternalId,
      ),
    );
    const incomingChampionships = fetched.championships.filter(
      ({ externalId }) => championshipExternalIds.has(externalId),
    );
    const incomingSeasons = this.toSeasons(incomingStages);

    await this.seasonsRepository.upsertMany(incomingSeasons);
    const seasons = (await this.seasonsRepository.getWhere({})).filter(
      ({ name }) => Number(name) >= earliestSeasonYear,
    );
    const existingChampionships = await this.championshipsRepository.getWhere({
      externalId: In([...championshipExternalIds]),
    });
    const championshipChanges = calculateChampionshipChanges({
      incoming: incomingChampionships,
      existing: existingChampionships,
    });

    await applyEntityChanges({
      repository: this.championshipsRepository,
      changes: championshipChanges,
      allowDeletion: false,
    });
    logEntityChanges({
      logger: this.logger,
      entityName: 'Championships',
      changes: championshipChanges,
      isComplete: fetched.isComplete,
      allowDeletion: false,
    });

    const championships = await this.championshipsRepository.getWhere({
      externalId: In([...championshipExternalIds]),
    });
    const existingStages = await this.stagesRepository.getWhere({
      championship: { id: In(championships.map(({ id }) => id)) },
    });
    const stageChanges = calculateStageChanges({
      incoming: incomingStages,
      existing: existingStages,
      championshipsByExternalId: new Map(
        championships.map((championship) => [
          championship.externalId,
          championship,
        ]),
      ),
      seasonsByName: new Map(seasons.map((season) => [season.name, season])),
    });

    await applyEntityChanges({
      repository: this.stagesRepository,
      changes: stageChanges,
      allowDeletion: false,
    });
    logEntityChanges({
      logger: this.logger,
      entityName: 'Calendar stages',
      changes: stageChanges,
      isComplete: fetched.isComplete,
      allowDeletion: false,
    });

    return championships;
  }

  private toSeasons(stages: Array<{ seasonName?: string }>): ISeason[] {
    return [
      ...new Map(
        stages.flatMap(({ seasonName }) =>
          seasonName ? [[seasonName, { name: seasonName }] as const] : [],
        ),
      ).values(),
    ];
  }
}
