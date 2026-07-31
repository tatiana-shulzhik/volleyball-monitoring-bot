import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { ISeason } from '../../interfaces/requests/seasons.interface';
import { SynchronizedSeasonCatalog } from '../../interfaces/responses/synchronized-season-catalog.interface';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import { calculateChampionshipChanges } from '../../shared/championships.utils';
import { parseSeasonEndYear } from '../../shared/season.utils';
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
  ) {}

  discoverCurrentAndFutureSeasons(): Promise<SynchronizedSeasonCatalog> {
    return this.synchronizeFrom(new Date().getFullYear());
  }

  synchronizeStoredRange(): Promise<SynchronizedSeasonCatalog> {
    return this.synchronizeFrom(
      new Date().getFullYear() - PREVIOUS_YEARS_COUNT,
    );
  }

  private async synchronizeFrom(
    earliestSeasonYear: number,
  ): Promise<SynchronizedSeasonCatalog> {
    this.logger.log(
      `Starting season catalog synchronization from ${earliestSeasonYear}`,
    );
    const fetched =
      await this.gateway.fetchSeasonCatalogSince(earliestSeasonYear);
    const incomingStages = fetched.stages.filter(
      ({ seasonName }) =>
        seasonName !== undefined &&
        (parseSeasonEndYear(seasonName) ?? 0) >= earliestSeasonYear,
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
      ({ name }) => (parseSeasonEndYear(name) ?? 0) >= earliestSeasonYear,
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

    return { championships, calendarStages: incomingStages, seasons };
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
