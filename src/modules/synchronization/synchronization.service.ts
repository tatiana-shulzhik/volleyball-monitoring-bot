import {
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { SynchronizationStateRepository } from '../../databases/repositories/synchronization-state.repository';
import { CleanupResult } from '../../interfaces/responses/cleanup.interface';
import { SynchronizedSeasonCatalog } from '../../interfaces/responses/synchronized-season-catalog.interface';
import {
  MOSCOW_TIME_ZONE,
  PREVIOUS_YEARS_COUNT,
} from '../../shared/consts/constants';
import { ECronExpression } from '../../shared/enums';
import { ChampionshipsService } from '../championships/championships.service';
import { LeaguesService } from '../leagues/leagues.service';
import { MatchesService } from '../matches/matches.service';
import { PlayersService } from '../players/players.service';
import { PlayerStatisticsService } from '../players/player-statistics.service';
import { SeasonsService } from '../seasons/seasons.service';
import { TeamsService } from '../teams/teams.service';
import { LegaVolleyCatalogService } from '../lega-volley/lega-volley-catalog.service';
import { ESourceCode, ESynchronizationKey } from '../../shared/enums';

@Injectable()
export class SynchronizationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SynchronizationService.name);
  private isRunning = false;

  constructor(
    private readonly seasonsService: SeasonsService,
    private readonly championshipsService: ChampionshipsService,
    private readonly leaguesService: LeaguesService,
    private readonly teamsService: TeamsService,
    private readonly playersService: PlayersService,
    private readonly playerStatisticsService: PlayerStatisticsService,
    private readonly matchesService: MatchesService,
    private readonly seasonsRepository: SeasonsRepository,
    private readonly stagesRepository: CompetitionStagesRepository,
    private readonly playersRepository: PlayersRepository,
    private readonly teamsRepository: TeamsRepository,
    private readonly synchronizationStateRepository: SynchronizationStateRepository,
    private readonly legaVolleyCatalogService: LegaVolleyCatalogService,
  ) {}

  onApplicationBootstrap(): void {
    void this.initializeCatalogs();
  }

  private async initializeCatalogs(): Promise<void> {
    await this.initializeEmptyCatalog();
    await this.initializeLegaVolleyCatalog();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'daily-new-seasons-discovery',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async synchronizeCurrentCatalogByCron(): Promise<void> {
    await this.runExclusive(async () => {
      await this.synchronizeCatalog(
        await this.seasonsService.discoverCurrentAndFutureSeasons(),
      );
      await this.legaVolleyCatalogService.synchronizeCurrentAndFuture();
    }, false);
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM, {
    name: 'daily-outdated-catalog-cleanup',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async deleteOutdatedCatalogByCron(): Promise<void> {
    await this.runExclusive(() => this.removeOutdatedCatalog(), false);
  }

  @Cron(ECronExpression.Every3HoursAtMinute30, {
    name: 'upcoming-matches-synchronization',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async synchronizeMatchesByCron(): Promise<void> {
    await this.runExclusive(async () => {
      await this.performMatchesSynchronization(true);
      await this.legaVolleyCatalogService.synchronizeCurrentAndFutureMatches();
      await this.matchesService.startMonitoring();
    }, false);
  }

  @Cron(ECronExpression.EveryHourAtMinute10, {
    name: 'hourly-player-statistics-synchronization',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async synchronizePlayerStatisticsByCron(): Promise<void> {
    await this.runExclusive(() => this.synchronizePlayerStatistics(), false);
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'daily-incomplete-match-attack-statistics-repair',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async repairIncompletePlayerStatisticsByCron(): Promise<void> {
    await this.runExclusive(
      () => this.repairIncompletePlayerStatistics(),
      false,
    );
  }

  private async removeOutdatedCatalog(): Promise<CleanupResult> {
    const beforeYear = new Date().getFullYear() - PREVIOUS_YEARS_COUNT;

    return this.seasonsRepository.useTransaction(undefined, async (manager) => {
      const seasons = await this.seasonsRepository.deleteOutdated(
        beforeYear,
        manager,
      );
      const players = await this.playersRepository.deleteOrphans(manager);
      const teams = await this.teamsRepository.deleteOrphans(manager);
      const result = { seasons, players, teams };

      this.logger.log(
        `Outdated catalog deleted: ${seasons} seasons, ` +
          `${players} orphan players, ${teams} orphan teams`,
      );

      return result;
    });
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
        await this.synchronizeCatalog(
          await this.seasonsService.synchronizeStoredRange(),
        );
        await this.performMatchesSynchronization(false);
      });
      this.logger.log('Full catalog synchronization completed');

      await this.runExclusive(() =>
        this.synchronizeIncompletePlayerStatistics(),
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

  private async synchronizeCatalog(
    seasonCatalog: SynchronizedSeasonCatalog,
  ): Promise<void> {
    const stages = await this.championshipsService.synchronize(seasonCatalog);
    const leagueCatalog = await this.leaguesService.synchronize(stages);
    const teams = await this.teamsService.synchronize(leagueCatalog);

    await this.playersService.synchronize(teams.rosterSources);
  }

  private async performMatchesSynchronization(
    frequentOnly: boolean,
  ): Promise<void> {
    const stages = (
      await this.stagesRepository.getWhere({})
    ).filter(
      ({ championship }) => championship.source?.code === ESourceCode.Cev,
    );

    if (frequentOnly) {
      await this.matchesService.synchronizeFrequently(stages);
      return;
    }

    await this.matchesService.synchronize(stages);
  }

  private async synchronizePlayerStatistics(): Promise<void> {
    const now = new Date();
    await this.loadPlayerStatistics(
      this.filterCevStages(
        await this.stagesRepository.getWhere({
          startsAt: LessThanOrEqual(now),
          endsAt: MoreThanOrEqual(now),
        }),
      ),
    );
  }

  private async synchronizeIncompletePlayerStatistics(): Promise<void> {
    await this.loadPlayerStatistics(
      this.filterCevStages(
        await this.stagesRepository.getWhere({
          startsAt: LessThanOrEqual(new Date()),
        }),
      ),
    );
  }

  private async repairIncompletePlayerStatistics(): Promise<void> {
    const stageIds =
      await this.playerStatisticsService.findPendingAttackStageIds();

    if (!stageIds.length) {
      this.logger.log('No incomplete match attack statistics found');
      return;
    }

    this.logger.log(
      `Repairing match attack statistics for ${stageIds.length} stages`,
    );
    await this.playerStatisticsService.synchronizePendingAttacks(
      this.filterCevStages(
        await this.stagesRepository.getWhere({ id: In(stageIds) }),
      ),
    );
  }

  private async loadPlayerStatistics(
    stages: CompetitionStagesEntity[],
  ): Promise<void> {
    await this.playerStatisticsService.synchronize(stages);
  }

  private filterCevStages(
    stages: CompetitionStagesEntity[],
  ): CompetitionStagesEntity[] {
    return stages.filter(
      ({ championship }) => championship.source?.code === ESourceCode.Cev,
    );
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
