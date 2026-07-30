import { Injectable, Logger } from '@nestjs/common';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { ICevChampionship } from '../../interfaces/requests/championships.interface';
import { ISeason } from '../../interfaces/requests/seasons.interface';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import { calculateChampionshipChanges } from '../../shared/championships.utils';
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
    const incoming = fetched.championships.filter(
      ({ seasonName }) => Number(seasonName) >= earliestSeasonYear,
    );
    const incomingSeasons = this.toSeasons(incoming);

    await this.seasonsRepository.upsertMany(incomingSeasons);
    const seasons = (await this.seasonsRepository.findAll()).filter(
      ({ name }) => Number(name) >= earliestSeasonYear,
    );
    const existing = await this.championshipsRepository.findBySeasonIds(
      seasons.map(({ id }) => id),
    );
    const changes = calculateChampionshipChanges({
      incoming,
      existing,
      seasonsByName: new Map(seasons.map((season) => [season.name, season])),
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

    return this.championshipsRepository.findBySeasonIds(
      seasons.map(({ id }) => id),
    );
  }

  private toSeasons(championships: ICevChampionship[]): ISeason[] {
    return [
      ...new Map(
        championships.map(({ seasonName }) => [
          seasonName,
          { name: seasonName },
        ]),
      ).values(),
    ];
  }
}
