import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { CleanupResult } from '../../interfaces/responses/cleanup.interface';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import { ChampionshipsService } from '../championships/championships.service';
import { LeaguesService } from '../leagues/leagues.service';
import { PlayersService } from '../players/players.service';
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
    private readonly playersService: PlayersService,
    private readonly seasonsRepository: SeasonsRepository,
    private readonly playersRepository: PlayersRepository,
    private readonly teamsRepository: TeamsRepository,
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
    name: 'daily-outdated-catalog-cleanup',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async deleteOutdatedCatalogByCron(): Promise<void> {
    await this.runExclusive(() => this.removeOutdatedCatalog(), false);
  }

  async synchronizeStoredCatalogRange(): Promise<void> {
    await this.runExclusive(() => this.performStoredCatalogSynchronization());
  }

  async deleteOutdatedCatalog(): Promise<CleanupResult> {
    return (
      (await this.runExclusive(() => this.removeOutdatedCatalog())) ?? {
        seasons: 0,
        players: 0,
        teams: 0,
      }
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

  private async synchronizeCurrentCatalog(): Promise<void> {
    const seasons = await this.seasonsService.discoverCurrentAndFutureSeasons();
    const championships = await this.championshipsService.synchronize(seasons);
    const leagueCatalog = await this.leaguesService.synchronize(championships);
    const synchronizedTeams =
      await this.teamsService.synchronize(leagueCatalog);

    await this.playersService.synchronize(synchronizedTeams.rosterSources);
  }

  private async performStoredCatalogSynchronization(): Promise<void> {
    const seasons = await this.seasonsService.synchronizeStoredRange();
    const championships = await this.championshipsService.synchronize(seasons);
    const leagueCatalog = await this.leaguesService.synchronize(championships);
    const synchronizedTeams =
      await this.teamsService.synchronize(leagueCatalog);

    await this.playersService.synchronize(synchronizedTeams.rosterSources);
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
