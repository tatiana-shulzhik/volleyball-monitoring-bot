import { Injectable, Logger } from '@nestjs/common';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { FetchedSeasons } from '../../interfaces/requests/seasons.interface';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import { calculateSeasonsChanges } from '../../shared/seasons.utils';
import {
  applyEntityChanges,
  logEntityChanges,
} from '../../shared/synchronization.utils';

@Injectable()
export class SeasonsService {
  private readonly logger = new Logger(SeasonsService.name);

  constructor(
    private readonly gateway: CevGateway,
    private readonly repository: SeasonsRepository,
  ) {}

  async discoverCurrentAndFutureSeasons(): Promise<SeasonsEntity[]> {
    const currentYear = new Date().getFullYear();

    return this.synchronizeFrom(currentYear);
  }

  async synchronizeStoredRange(): Promise<SeasonsEntity[]> {
    const currentYear = new Date().getFullYear();
    const earliestStoredYear = currentYear - PREVIOUS_YEARS_COUNT;

    return this.synchronizeFrom(earliestStoredYear);
  }

  private async synchronizeFrom(
    earliestSeasonYear: number,
  ): Promise<SeasonsEntity[]> {
    this.logger.log(
      `Starting seasons synchronization from ${earliestSeasonYear}`,
    );

    const fetched = await this.fetchSeasons(earliestSeasonYear - 1);
    const incomingSeasons = fetched.seasons.filter(
      ({ yearEnd }) => yearEnd >= earliestSeasonYear,
    );
    const storedSeasons = (await this.repository.findAll()).filter(
      ({ yearEnd }) => yearEnd >= earliestSeasonYear,
    );
    const changes = calculateSeasonsChanges(incomingSeasons, storedSeasons);

    await applyEntityChanges({
      repository: this.repository,
      changes,
      allowDeletion: false,
    });
    logEntityChanges({
      logger: this.logger,
      entityName: 'Seasons',
      changes,
      isComplete: fetched.isComplete,
      allowDeletion: false,
    });

    return (await this.repository.findAll()).filter(
      ({ yearEnd }) => yearEnd >= earliestSeasonYear,
    );
  }

  private async fetchSeasons(earliestYear: number): Promise<FetchedSeasons> {
    return this.gateway.fetchSeasonsSince(earliestYear);
  }
}
