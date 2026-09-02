import { Injectable, Logger } from '@nestjs/common';
import { In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { CleanupResult } from '../../interfaces/responses/cleanup.interface';
import { SynchronizedSeasonCatalog } from '../../interfaces/responses/synchronized-season-catalog.interface';
import { ESourceCode } from '../../shared/enums';
import {
  getEarliestCatalogYear,
  parseSeasonEndYear,
} from '../../shared/season.utils';
import { ChampionshipsService } from '../championships/championships.service';
import { LeaguesService } from '../leagues/leagues.service';
import { MatchesService } from '../matches/matches.service';
import { PlayerStatisticsService } from '../players/player-statistics.service';
import { PlayersService } from '../players/players.service';
import { SeasonsService } from '../seasons/seasons.service';
import { TeamsService } from '../teams/teams.service';

@Injectable()
export class CevCatalogService {
  private readonly logger = new Logger(CevCatalogService.name);

  constructor(
    private readonly gateway: CevGateway,
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
  ) {}

  async synchronizeStoredRange(): Promise<boolean> {
    const earliestYear = getEarliestCatalogYear();
    await this.synchronizeCatalog(await this.synchronizeSeasons(earliestYear));
    return this.synchronizeMatches(false);
  }

  async synchronizeCurrentAndFuture(): Promise<void> {
    const currentYear = new Date().getFullYear();
    await this.synchronizeCatalog(await this.synchronizeSeasons(currentYear));
  }

  async synchronizeCurrentAndFutureMatches(): Promise<void> {
    await this.synchronizeMatches(true);
  }

  startMonitoring(): Promise<number> {
    return this.matchesService.startMonitoring();
  }

  async synchronizeCurrentPlayerStatistics(): Promise<void> {
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

  async synchronizeIncompletePlayerStatistics(): Promise<void> {
    await this.loadPlayerStatistics(
      this.filterCevStages(
        await this.stagesRepository.getWhere({
          startsAt: LessThanOrEqual(new Date()),
        }),
      ),
    );
  }

  async repairIncompletePlayerStatistics(): Promise<void> {
    const stageIds =
      await this.playerStatisticsService.findPendingAttackStageIds();

    if (!stageIds.length) {
      this.logger.log('No incomplete match attack statistics found');
      return;
    }

    this.logger.log(
      `Repairing match attack statistics for ${stageIds.length} stages`,
    );
    await this.loadPlayerStatistics(
      this.filterCevStages(
        await this.stagesRepository.getWhere({ id: In(stageIds) }),
      ),
    );
  }

  async removeOutdatedCatalog(): Promise<CleanupResult> {
    const beforeYear = getEarliestCatalogYear();

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

  private async synchronizeCatalog(
    seasonCatalog: SynchronizedSeasonCatalog,
  ): Promise<void> {
    const stages = await this.championshipsService.synchronize(
      seasonCatalog,
      await this.gateway.fetchCompetitionStages(seasonCatalog.championships),
    );
    const leagueCatalog = await this.leaguesService.synchronize(
      stages,
      await this.gateway.fetchLeagueCatalog(stages),
    );
    const teams = await this.teamsService.synchronize(leagueCatalog);

    await this.playersService.synchronize(
      teams.rosterSources,
      await this.gateway.fetchPlayers(teams.rosterSources),
    );
  }

  private async synchronizeSeasons(
    earliestYear: number,
  ): Promise<SynchronizedSeasonCatalog> {
    const fetched = await this.gateway.fetchSeasonCatalogSince(earliestYear);
    const calendarStages = fetched.stages.filter(
      ({ seasonName }) =>
        seasonName !== undefined &&
        (parseSeasonEndYear(seasonName) ?? 0) >= earliestYear,
    );
    const championshipExternalIds = new Set(
      calendarStages.map(
        ({ championshipExternalId }) => championshipExternalId,
      ),
    );
    const championshipsByExternalId =
      await this.championshipsService.upsertCatalogChampionships(
        fetched.championships.filter(({ externalId }) =>
          championshipExternalIds.has(externalId),
        ),
        ESourceCode.Cev,
      );
    const seasonsByName =
      await this.seasonsService.upsertCatalogSeasons(calendarStages);

    return {
      championships: [...championshipsByExternalId.values()].filter(
        ({ externalId }) => championshipExternalIds.has(externalId),
      ),
      calendarStages,
      seasons: [...seasonsByName.values()].filter(
        ({ name }) => (parseSeasonEndYear(name) ?? 0) >= earliestYear,
      ),
    };
  }

  private async synchronizeMatches(frequentOnly: boolean): Promise<boolean> {
    let stages = this.filterCevStages(await this.stagesRepository.getWhere({}));

    if (frequentOnly) {
      stages = await this.matchesService.getFrequentlyRelevantStages(stages);
    }

    const fetched = await this.gateway.fetchMatches(stages);
    await this.matchesService.synchronize(stages, fetched);
    return fetched.isComplete;
  }

  private async loadPlayerStatistics(
    stages: CompetitionStagesEntity[],
  ): Promise<void> {
    const matches =
      await this.playerStatisticsService.findPendingMatches(stages);
    if (!matches.length) return;

    const fetchedAttacks =
      await this.gateway.fetchMatchAttackStatistics(matches);
    const rosterMatches =
      await this.playerStatisticsService.findMatchesRequiringRosters(
        matches,
        fetchedAttacks,
      );
    const fetchedRosters = rosterMatches.length
      ? await this.gateway.fetchMatchRosters(rosterMatches)
      : [];

    await this.playerStatisticsService.synchronizeFetchedAttacks(
      stages,
      matches,
      fetchedAttacks,
      fetchedRosters,
    );
  }

  private filterCevStages(
    stages: CompetitionStagesEntity[],
  ): CompetitionStagesEntity[] {
    return stages.filter(
      ({ championship }) => championship.source?.code === ESourceCode.Cev,
    );
  }
}
