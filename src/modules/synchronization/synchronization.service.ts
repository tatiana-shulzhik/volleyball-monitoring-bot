import {
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SynchronizationStateRepository } from '../../databases/repositories/synchronization-state.repository';
import { MOSCOW_TIME_ZONE } from '../../shared/consts/constants';
import { ECronExpression } from '../../shared/enums';
import { CevCatalogService } from '../cev/cev-catalog.service';
import { LegaVolleyCatalogService } from '../lega-volley/lega-volley-catalog.service';
import { LegaVolleyFemminileCatalogService } from '../lega-volley-femminile/lega-volley-femminile-catalog.service';
import { ESourceCode, ESynchronizationKey } from '../../shared/enums';

@Injectable()
export class SynchronizationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SynchronizationService.name);
  private isRunning = false;

  constructor(
    private readonly synchronizationStateRepository: SynchronizationStateRepository,
    private readonly cevCatalogService: CevCatalogService,
    private readonly legaVolleyCatalogService: LegaVolleyCatalogService,
    private readonly legaVolleyFemminileCatalogService: LegaVolleyFemminileCatalogService,
  ) {}

  onApplicationBootstrap(): void {
    void this.initializeCatalogs();
  }

  private async initializeCatalogs(): Promise<void> {
    await this.initializeEmptyCatalog();
    await this.initializeLegaVolleyCatalog();
    await this.initializeLegaVolleyFemminileCatalog();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'daily-new-seasons-discovery',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async synchronizeCurrentCatalogByCron(): Promise<void> {
    await this.runExclusive(async () => {
      await this.cevCatalogService.synchronizeCurrentAndFuture();
      await this.legaVolleyCatalogService.synchronizeCurrentAndFuture();
      await this.legaVolleyFemminileCatalogService.synchronizeCurrentAndFuture();
      await this.legaVolleyCatalogService.synchronizeCurrentMatchStatistics();
      await this.legaVolleyFemminileCatalogService.synchronizeCurrentMatchStatistics();
    }, false);
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM, {
    name: 'daily-outdated-catalog-cleanup',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async deleteOutdatedCatalogByCron(): Promise<void> {
    await this.runExclusive(
      () => this.cevCatalogService.removeOutdatedCatalog(),
      false,
    );
  }

  @Cron(ECronExpression.Every3HoursAtMinute30, {
    name: 'upcoming-matches-synchronization',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async synchronizeMatchesByCron(): Promise<void> {
    await this.runExclusive(async () => {
      await this.cevCatalogService.synchronizeCurrentAndFutureMatches();
      await this.legaVolleyCatalogService.synchronizeCurrentAndFutureMatches();
      await this.legaVolleyFemminileCatalogService.synchronizeCurrentAndFutureMatches();
      await this.cevCatalogService.startMonitoring();
    }, false);
  }

  @Cron(ECronExpression.EveryHourAtMinute10, {
    name: 'hourly-player-statistics-synchronization',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async synchronizePlayerStatisticsByCron(): Promise<void> {
    await this.runExclusive(async () => {
      await this.cevCatalogService.synchronizeCurrentPlayerStatistics();
      await this.legaVolleyFemminileCatalogService.synchronizeCurrentMatchStatistics();
    }, false);
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'daily-incomplete-match-attack-statistics-repair',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async repairIncompletePlayerStatisticsByCron(): Promise<void> {
    await this.runExclusive(
      () => this.cevCatalogService.repairIncompletePlayerStatistics(),
      false,
    );
  }

  private async initializeEmptyCatalog(): Promise<void> {
    try {
      if (
        await this.synchronizationStateRepository.hasCompleted(
          ESynchronizationKey.CevInitialCatalog,
        )
      ) {
        this.logger.log(
          'Catalog is already initialized; startup synchronization skipped',
        );
        return;
      }

      this.logger.log('Starting full catalog synchronization');
      await this.runExclusive(async () => {
        await this.cevCatalogService.synchronizeStoredRange();
      });
      this.logger.log('Full catalog synchronization completed');

      await this.runExclusive(() =>
        this.cevCatalogService.synchronizeIncompletePlayerStatistics(),
      );
      await this.synchronizationStateRepository.markCompleted(
        ESynchronizationKey.CevInitialCatalog,
      );
    } catch (error) {
      this.logger.error(
        'Initial catalog synchronization failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async initializeLegaVolleyCatalog(): Promise<void> {
    try {
      if (
        await this.synchronizationStateRepository.hasCompleted(
          ESynchronizationKey.LegaVolleyInitialCatalog,
          ESourceCode.LegaVolley,
        )
      ) {
        this.logger.log(
          'LegaVolley catalog is already initialized; startup synchronization skipped',
        );
        return;
      }

      this.logger.log('Starting LegaVolley catalog synchronization');
      await this.runExclusive(() =>
        this.legaVolleyCatalogService.synchronizeStoredRange(),
      );
      await this.runExclusive(() =>
        this.legaVolleyCatalogService.synchronizeMatchStatisticsStoredRange(),
      );
      await this.synchronizationStateRepository.markCompleted(
        ESynchronizationKey.LegaVolleyInitialCatalog,
        ESourceCode.LegaVolley,
      );
      this.logger.log('LegaVolley catalog synchronization completed');
    } catch (error) {
      this.logger.error(
        'LegaVolley catalog synchronization failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async initializeLegaVolleyFemminileCatalog(): Promise<void> {
    try {
      if (
        await this.synchronizationStateRepository.hasCompleted(
          ESynchronizationKey.LegaVolleyFemminileInitialCatalog,
          ESourceCode.LegaVolleyFemminile,
        )
      ) {
        this.logger.log(
          'LegaVolleyFemminile catalog is already initialized; startup synchronization skipped',
        );
        return;
      }

      this.logger.log('Starting LegaVolleyFemminile catalog synchronization');
      await this.runExclusive(() =>
        this.legaVolleyFemminileCatalogService.synchronizeStoredRange(),
      );
      await this.runExclusive(() =>
        this.legaVolleyFemminileCatalogService.synchronizeMatchStatisticsStoredRange(),
      );
      await this.synchronizationStateRepository.markCompleted(
        ESynchronizationKey.LegaVolleyFemminileInitialCatalog,
        ESourceCode.LegaVolleyFemminile,
      );
      this.logger.log('LegaVolleyFemminile catalog synchronization completed');
    } catch (error) {
      this.logger.error(
        'LegaVolleyFemminile catalog synchronization failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
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
