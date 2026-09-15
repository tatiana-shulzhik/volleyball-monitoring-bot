import { Injectable, Logger } from '@nestjs/common';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { CevGateway } from '../../gateway/cev.gateway';
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
  ) {}

  async synchronizeStoredRange(): Promise<boolean> {
    const earliestYear = getEarliestCatalogYear();
    await this.synchronizeCatalog(await this.synchronizeSeasons(earliestYear));
    const { isComplete } = await this.synchronizeMatches(false);
    await this.synchronizeCevPlayersFromMatchRosters();
    return isComplete;
  }

  async synchronizeCurrentAndFuture(): Promise<void> {
    const currentYear = new Date().getFullYear();
    await this.synchronizeCatalog(await this.synchronizeSeasons(currentYear));
    const { stages } = await this.synchronizeMatches(true);
    await this.synchronizeCevPlayersFromMatchRosters(stages);
  }

  async synchronizeCurrentAndFutureMatches(): Promise<void> {
    const { stages } = await this.synchronizeMatches(true);
    await this.synchronizeCevPlayersFromMatchRosters(stages);
  }

  async synchronizeCurrentPlayerStatistics(): Promise<void> {
    const now = new Date();
    await this.loadPlayerStatistics(
      await this.championshipsService.getCurrentCevStages(now),
    );
  }

  async synchronizeIncompletePlayerStatistics(): Promise<void> {
    await this.loadPlayerStatistics(
      await this.championshipsService.getStartedCevStages(new Date()),
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
      await this.championshipsService.getCevStagesByIds(stageIds),
    );
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
    await this.teamsService.updateCountries(
      await this.gateway.fetchTeamCountries(teams.rosterSources),
    );

    this.logger.log(
      `CEV catalog synchronized: ${seasonCatalog.championships.length} championships, ` +
        `${stages.length} stages, ${teams.teams.length} teams, ` +
        `player rosters will be loaded from match applications`,
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

  private async synchronizeMatches(frequentOnly: boolean): Promise<{
    isComplete: boolean;
    stages: CompetitionStagesEntity[];
  }> {
    let stages = await this.championshipsService.getCevStages();

    if (frequentOnly) {
      stages = await this.matchesService.getFrequentlyRelevantStages(stages);
    }

    const fetched = await this.gateway.fetchMatches(stages);
    await this.matchesService.synchronize(stages, fetched);
    return { isComplete: fetched.isComplete, stages };
  }

  private async synchronizeCevPlayersFromMatchRosters(
    stages?: CompetitionStagesEntity[],
  ): Promise<void> {
    const { matches, sources } =
      await this.matchesService.getCevMatchesWithRosterSources(
        stages?.map(({ id }) => id),
      );
    const birthYears = await this.gateway.fetchTeamPlayerBirthYears(sources);
    const players = await this.playersService.synchronize(
      sources,
      await this.gateway.fetchPlayersFromMatchRosters(matches, birthYears),
    );

    this.logger.log(`CEV players synchronized from match rosters: ${players}`);
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
}
