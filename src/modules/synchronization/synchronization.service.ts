import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import { ChampionshipsService } from '../championships/championships.service';
import { LeaguesService } from '../leagues/leagues.service';
import { SeasonsService } from '../seasons/seasons.service';
import { TeamsService } from '../teams/teams.service';

const MOSCOW_TIME_ZONE = 'Europe/Moscow';

@Injectable()
export class SynchronizationService {
  private readonly logger = new Logger(SynchronizationService.name);
  private isRunning = false;

  constructor(
    private readonly seasonsService: SeasonsService,
    private readonly championshipsService: ChampionshipsService,
    private readonly leaguesService: LeaguesService,
    private readonly teamsService: TeamsService,
    private readonly seasonsRepository: SeasonsRepository,
  ) {}

  @Cron('0 0 * * *', {
    name: 'daily-new-seasons-discovery',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async synchronizeCurrentCatalogByCron(): Promise<void> {
    await this.runExclusive(() => this.synchronizeCurrentCatalog(), false);
  }

  @Cron('0 1 * * *', {
    name: 'daily-outdated-seasons-cleanup',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async deleteOutdatedSeasonsByCron(): Promise<void> {
    await this.runExclusive(() => this.removeOutdatedSeasons(), false);
  }

  async synchronizeStoredCatalogRange(): Promise<void> {
    await this.runExclusive(() => this.performStoredCatalogSynchronization());
  }

  async deleteOutdatedSeasons(): Promise<number> {
    return (await this.runExclusive(() => this.removeOutdatedSeasons())) ?? 0;
  }

  private async removeOutdatedSeasons(): Promise<number> {
    const beforeYear = new Date().getFullYear() - PREVIOUS_YEARS_COUNT;
    const deleted = await this.seasonsRepository.deleteOutdated(beforeYear);

    this.logger.log(`Outdated seasons deleted: ${deleted}`);

    return deleted;
  }

  private async synchronizeCurrentCatalog(): Promise<void> {
    const seasons = await this.seasonsService.discoverCurrentAndFutureSeasons();
    const championships = await this.championshipsService.synchronize(seasons);
    const leagueCatalog = await this.leaguesService.synchronize(championships);

    await this.teamsService.synchronize(leagueCatalog);
  }

  private async performStoredCatalogSynchronization(): Promise<void> {
    const seasons = await this.seasonsService.synchronizeStoredRange();
    const championships = await this.championshipsService.synchronize(seasons);
    const leagueCatalog = await this.leaguesService.synchronize(championships);

    await this.teamsService.synchronize(leagueCatalog);
  }

  private async runExclusive<T>(
    action: () => Promise<T>,
    throwWhenLocked = true,
  ): Promise<T | undefined> {
    if (this.isRunning) {
      if (throwWhenLocked) {
        throw new ConflictException('Synchronization is already running');
      }

      this.logger.warn('Cron task skipped: synchronization is already running');
      return undefined;
    }

    this.isRunning = true;

    try {
      return await action();
    } finally {
      this.isRunning = false;
    }
  }
}
