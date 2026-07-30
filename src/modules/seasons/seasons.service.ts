import { Injectable, Logger } from '@nestjs/common';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import {
  SeasonCycle,
  SeasonsRepository,
} from '../../databases/repositories/seasons.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { ICevChampionship } from '../../interfaces/requests/championships.interface';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import { ECompetitionType } from '../../shared/enums';
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
    const fetched = await this.gateway.fetchSeasonCatalogSince(
      earliestSeasonYear - 1,
    );
    const incoming = fetched.championships.filter(
      ({ yearEnd }) => yearEnd >= earliestSeasonYear,
    );
    const seasonCycles = this.toSeasonCycles(incoming);

    await this.seasonsRepository.upsertMany(seasonCycles);
    const seasons = (await this.seasonsRepository.findAll()).filter(
      ({ yearEnd }) => yearEnd >= earliestSeasonYear,
    );
    const existing = await this.championshipsRepository.findBySeasonIds(
      seasons.map(({ id }) => id),
    );
    const changes = calculateChampionshipChanges({
      incoming,
      existing,
      seasonsByCycle: new Map(
        seasons.map((season) => [this.cycleKey(season), season]),
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

    return this.championshipsRepository.findBySeasonIds(
      seasons.map(({ id }) => id),
    );
  }

  private toSeasonCycles(championships: ICevChampionship[]): SeasonCycle[] {
    return [
      ...new Map(
        championships.map((championship) => {
          const cycle = {
            name:
              championship.yearStart === championship.yearEnd
                ? String(championship.yearEnd)
                : `${championship.yearStart}/${championship.yearEnd}`,
            competitionType: championship.competitionType,
            yearStart: championship.yearStart,
            yearEnd: championship.yearEnd,
          };

          return [this.cycleKey(cycle), cycle];
        }),
      ).values(),
    ];
  }

  private cycleKey(cycle: {
    competitionType: ECompetitionType;
    yearStart: number;
    yearEnd: number;
  }): string {
    return `${cycle.competitionType}:${cycle.yearStart}:${cycle.yearEnd}`;
  }
}
