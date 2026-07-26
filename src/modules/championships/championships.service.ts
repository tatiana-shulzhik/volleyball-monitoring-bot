import { Injectable, Logger } from '@nestjs/common';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { CevGateway } from '../../gateway/cev.gateway';
import { calculateChampionshipChanges } from '../../shared/championships.utils';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import {
  applyEntityChanges,
  logEntityChanges,
} from '../../shared/synchronization.utils';

@Injectable()
export class ChampionshipsService {
  private readonly logger = new Logger(ChampionshipsService.name);

  constructor(
    private readonly gateway: CevGateway,
    private readonly seasonsRepository: SeasonsRepository,
    private readonly championshipsRepository: ChampionshipsRepository,
  ) {}

  async synchronizeCurrentAndFuture(): Promise<void> {
    await this.synchronizeFrom(new Date().getFullYear());
  }

  async synchronizeStoredRange(): Promise<void> {
    const earliestYear = new Date().getFullYear() - PREVIOUS_YEARS_COUNT;

    await this.synchronizeFrom(earliestYear);
  }

  private async synchronizeFrom(earliestYear: number): Promise<void> {
    const seasons = (await this.seasonsRepository.findAll()).filter(
      ({ yearEnd }) => yearEnd >= earliestYear,
    );

    if (!seasons.length) {
      this.logger.warn('No seasons found; championships sync skipped');
      return;
    }

    this.logger.log(
      `Starting championships synchronization for ${seasons.length} seasons`,
    );

    await this.synchronizeSeasons(seasons);
  }

  private async synchronizeSeasons(seasons: SeasonsEntity[]): Promise<void> {
    const fetched = await this.gateway.fetchChampionships(seasons);
    const existing = await this.championshipsRepository.findBySeasonIds(
      seasons.map(({ id }) => id),
    );
    const changes = calculateChampionshipChanges({
      incoming: fetched.championships,
      existing,
      seasonsByExternalId: new Map(
        seasons.map((season) => [season.externalId, season]),
      ),
    });

    await applyEntityChanges({
      repository: this.championshipsRepository,
      changes,
      allowDeletion: fetched.isComplete,
    });
    logEntityChanges({
      logger: this.logger,
      entityName: 'Championships',
      changes,
      isComplete: fetched.isComplete,
      allowDeletion: true,
    });
  }
}
