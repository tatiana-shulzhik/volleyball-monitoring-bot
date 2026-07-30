import {
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { CleanupResult } from '../../interfaces/responses/cleanup.interface';
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
    private readonly championshipsRepository: ChampionshipsRepository,
    private readonly stagesRepository: CompetitionStagesRepository,
    private readonly playersRepository: PlayersRepository,
    private readonly teamsRepository: TeamsRepository,
  ) {}

  onApplicationBootstrap(): void {
    void this.initializeEmptyCatalog();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'daily-new-seasons-discovery',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async synchronizeCurrentCatalogByCron(): Promise<void> {
    await this.runExclusive(() => this.synchronizeCurrentCatalog(), false);
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

  private async synchronizeCurrentCatalog(): Promise<void> {
    const championships =
      await this.seasonsService.discoverCurrentAndFutureSeasons();
    const stages = await this.championshipsService.synchronize(championships);
    const leagueCatalog = await this.leaguesService.synchronize(stages);
    const synchronizedTeams =
      await this.teamsService.synchronize(leagueCatalog);

    await this.playersService.synchronize(synchronizedTeams.rosterSources);
  }

  private async performStoredCatalogSynchronization(): Promise<void> {
    const championships = await this.seasonsService.synchronizeStoredRange();
    const stages = await this.championshipsService.synchronize(championships);
    const leagueCatalog = await this.leaguesService.synchronize(stages);
    const synchronizedTeams =
      await this.teamsService.synchronize(leagueCatalog);

    await this.playersService.synchronize(synchronizedTeams.rosterSources);
    await this.performMatchesSynchronization(false);
  }

  private async initializeEmptyCatalog(): Promise<void> {
    try {
      this.logger.log('Starting full catalog synchronization');
      await this.runExclusive(() => this.performStoredCatalogSynchronization());
      this.logger.log('Full catalog synchronization completed');

      await this.runExclusive(() =>
        this.synchronizeIncompletePlayerStatistics(),
      );
    } catch (error) {
      this.logger.error(
        'Initial catalog synchronization failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async performMatchesSynchronization(
    frequentOnly: boolean,
  ): Promise<void> {
    const championships = await this.championshipsRepository.getWhere({});
    const stages = await this.stagesRepository.getWhere({
      championship: { id: In(championships.map(({ id }) => id)) },
    });

    if (frequentOnly) {
      await this.matchesService.synchronizeFrequently(stages);
      return;
    }

    await this.matchesService.synchronize(stages);
  }

  private async synchronizePlayerStatistics(): Promise<void> {
    const now = new Date();
    await this.loadPlayerStatistics(
      await this.championshipsRepository.getWhere({
        stages: {
          startsAt: LessThanOrEqual(now),
          endsAt: MoreThanOrEqual(now),
        },
      }),
    );
  }

  private async synchronizeIncompletePlayerStatistics(): Promise<void> {
    await this.loadPlayerStatistics(
      await this.championshipsRepository.getWhere({
        stages: { startsAt: LessThanOrEqual(new Date()) },
      }),
    );
  }

  private async loadPlayerStatistics(
    championships: ChampionshipsEntity[],
  ): Promise<void> {
    await this.playerStatisticsService.synchronize(championships);
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
