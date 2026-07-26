import { Injectable, Logger } from '@nestjs/common';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { FetchedSeasons } from '../../interfaces/requests/seasons.interface';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import {
  calculateSeasonsChanges,
  selectRelevantSeasons,
} from '../../shared/seasons.utils';
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

  async discoverCurrentAndFutureSeasons(): Promise<void> {
    const currentYear = new Date().getFullYear();

    await this.synchronizeFrom(currentYear);
  }

  async synchronizeStoredRange(): Promise<void> {
    const currentYear = new Date().getFullYear();
    const earliestStoredYear = currentYear - PREVIOUS_YEARS_COUNT;

    await this.synchronizeFrom(earliestStoredYear);
  }

  private async synchronizeFrom(earliestYear: number): Promise<void> {
    this.logger.log(`Starting seasons synchronization from ${earliestYear}`);

    const fetched = await this.fetchSeasons(earliestYear);
    const incomingSeasons = selectRelevantSeasons(fetched.seasons).filter(
      ({ yearEnd }) => yearEnd >= earliestYear,
    );
    const storedSeasons = (await this.repository.findAll()).filter(
      ({ yearEnd }) => yearEnd >= earliestYear,
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
  }

  private async fetchSeasons(earliestYear: number): Promise<FetchedSeasons> {
    return this.gateway.fetchSeasonsSince(earliestYear);
  }
}
