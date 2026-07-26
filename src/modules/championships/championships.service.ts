import { Injectable, Logger } from '@nestjs/common';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { calculateChampionshipChanges } from '../../shared/championships.utils';
import {
  applyEntityChanges,
  logEntityChanges,
} from '../../shared/synchronization.utils';

@Injectable()
export class ChampionshipsService {
  private readonly logger = new Logger(ChampionshipsService.name);

  constructor(
    private readonly gateway: CevGateway,
    private readonly repository: ChampionshipsRepository,
  ) {}

  async synchronize(seasons: SeasonsEntity[]): Promise<ChampionshipsEntity[]> {
    if (!seasons.length) {
      this.logger.warn('No seasons found; championships sync skipped');
      return [];
    }

    this.logger.log(
      `Starting championships synchronization for ${seasons.length} seasons`,
    );

    const seasonIds = seasons.map(({ id }) => id);
    const fetched = await this.gateway.fetchChampionships(seasons);
    const existing = await this.repository.findBySeasonIds(seasonIds);
    const changes = calculateChampionshipChanges({
      incoming: fetched.championships,
      existing,
      seasonsByExternalId: new Map(
        seasons.map((season) => [season.externalId, season]),
      ),
    });

    await applyEntityChanges({
      repository: this.repository,
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

    return this.repository.findBySeasonIds(seasonIds);
  }
}
