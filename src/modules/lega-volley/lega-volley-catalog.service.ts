import { Injectable, Logger } from '@nestjs/common';
import { LegaVolleyGateway } from '../../gateway/lega-volley.gateway';
import { ChampionshipsService } from '../championships/championships.service';
import { LeaguesService } from '../leagues/leagues.service';
import { MatchesService } from '../matches/matches.service';
import { PlayerStatisticsService } from '../players/player-statistics.service';
import { PlayersService } from '../players/players.service';
import { SeasonsService } from '../seasons/seasons.service';
import { TeamsService } from '../teams/teams.service';
import { ESourceCode } from '../../shared/enums';
import { createLegaMatchLookupKey } from '../../shared/lega-volley.utils';
import {
  getEarliestCatalogYear,
  parseSeasonEndYear,
  parseSeasonStartYear,
} from '../../shared/season.utils';

@Injectable()
export class LegaVolleyCatalogService {
  private readonly logger = new Logger(LegaVolleyCatalogService.name);

  constructor(
    private readonly gateway: LegaVolleyGateway,
    private readonly seasonsService: SeasonsService,
    private readonly championshipsService: ChampionshipsService,
    private readonly leaguesService: LeaguesService,
    private readonly teamsService: TeamsService,
    private readonly playersService: PlayersService,
    private readonly matchesService: MatchesService,
    private readonly playerStatisticsService: PlayerStatisticsService,
  ) {}

  async synchronizeStoredRange(): Promise<void> {
    await this.synchronizeFrom(getEarliestCatalogYear(), true);
  }

  async synchronizeCurrentAndFuture(): Promise<void> {
    await this.synchronizeFrom(new Date().getFullYear(), false);
  }

  async synchronizeCurrentAndFutureMatches(): Promise<void> {
    const currentYear = new Date().getFullYear();
    const leagues = await this.leaguesService.getBySource(
      ESourceCode.LegaVolley,
    );
    const schedules = leagues.flatMap((league) => {
      const year = Number(league.stage.season?.name.slice(0, 4));
      return Number.isInteger(year) && year >= currentYear
        ? [{ year, leagueExternalId: league.externalId }]
        : [];
    });

    if (!schedules.length) {
      this.logger.log('No current LegaVolley leagues found for matches sync');
      return;
    }

    const [fetched, teams] = await Promise.all([
      this.gateway.fetchMatches(schedules),
      this.teamsService.getBySource(ESourceCode.LegaVolley),
    ]);
    const matches = await this.matchesService.upsertCatalogMatches(
      fetched.matches,
      new Map(leagues.map((league) => [league.externalId, league])),
      new Map(teams.map((team) => [team.externalId, team])),
    );

    this.logger.log(
      `LegaVolley matches synchronized: ${matches} matches, ` +
        `${fetched.isComplete ? 'complete' : 'partially complete'}`,
    );
  }

  async synchronizeMatchStatisticsStoredRange(): Promise<void> {
    await this.synchronizeMatchStatisticsSince(getEarliestCatalogYear());
  }

  async synchronizeCurrentMatchStatistics(): Promise<void> {
    await this.synchronizeMatchStatisticsSince(new Date().getFullYear());
  }

  private async synchronizeFrom(
    earliestYear: number,
    includeHistoricalTeams: boolean,
  ): Promise<void> {
    const catalog = await this.gateway.fetchSeasonCatalogSince(earliestYear);
    const seasonsByName = await this.seasonsService.upsertCatalogSeasons(
      catalog.stages,
    );
    const championshipsByExternalId =
      await this.championshipsService.upsertCatalogChampionships(
        catalog.championships,
        ESourceCode.LegaVolley,
      );
    const stagesByKey = await this.championshipsService.upsertCatalogStages(
      catalog.stages,
      seasonsByName,
      championshipsByExternalId,
      ESourceCode.LegaVolley,
    );
    const leagueCatalog = await this.gateway.fetchLeagueCatalog(
      this.getTeamStages(catalog.stages, includeHistoricalTeams),
    );
    const leaguesByExternalId = await this.leaguesService.upsertCatalogLeagues(
      leagueCatalog.leagues,
      stagesByKey,
      ESourceCode.LegaVolley,
    );
    const teamsByExternalId = await this.teamsService.upsertCatalogTeams(
      leagueCatalog.teams,
      leaguesByExternalId,
      ESourceCode.LegaVolley,
      'ITA',
    );
    const players = await this.playersService.upsertCatalogPlayers(
      leagueCatalog.players ?? [],
      teamsByExternalId,
      leaguesByExternalId,
      ESourceCode.LegaVolley,
    );
    const matches = await this.matchesService.upsertCatalogMatches(
      leagueCatalog.matches ?? [],
      leaguesByExternalId,
      teamsByExternalId,
    );

    this.logger.log(
      `LegaVolley catalog synchronized: ${catalog.championships.length} championships, ` +
        `${catalog.stages.length} stages, ${teamsByExternalId.size} teams, ` +
        `${players} players, ${matches} matches`,
    );
  }

  private async synchronizeMatchStatisticsSince(
    earliestYear: number,
  ): Promise<void> {
    const pendingMatches = (
      await this.playerStatisticsService.findPendingLegaMatches()
    ).filter((match) => {
      const seasonEndYear = parseSeasonEndYear(match.league.stage.season?.name);
      const matchYear = seasonEndYear ?? match.scheduledAt?.getFullYear();

      if (matchYear === undefined) {
        this.logger.warn(
          `[MATCH YEAR NOT RESOLVED] match=${match.id} ` +
            `league=${match.league.externalId}`,
        );
        return false;
      }

      return matchYear >= earliestYear;
    });
    const matchesWithExternalId = pendingMatches.flatMap((match) =>
      match.externalId?.match(/^\d+$/)
        ? [
            {
              sourceMatchId: match.externalId,
              leagueExternalId: match.league.externalId,
              playedOn: match.scheduledAt,
              homeTeamName: match.homeTeam.name,
              awayTeamName: match.awayTeam.name,
            },
          ]
        : [],
    );
    const storedStatisticsMatchIds = new Set(
      matchesWithExternalId.map(({ sourceMatchId }) => sourceMatchId),
    );
    const pendingMatchKeysByYearAndLeague = new Map<
      number,
      Map<number, Set<string>>
    >();

    for (const match of pendingMatches) {
      if (storedStatisticsMatchIds.has(match.externalId ?? '')) {
        continue;
      }

      const year =
        parseSeasonStartYear(match.league.stage.season?.name) ??
        match.scheduledAt?.getFullYear();
      if (year === undefined) {
        this.logger.warn(
          `[MATCH YEAR NOT RESOLVED] match=${match.id} ` +
            `league=${match.league.externalId}`,
        );
        continue;
      }

      let pendingMatchKeysByLeague = pendingMatchKeysByYearAndLeague.get(year);
      if (!pendingMatchKeysByLeague) {
        pendingMatchKeysByLeague = new Map();
        pendingMatchKeysByYearAndLeague.set(year, pendingMatchKeysByLeague);
      }

      let pendingMatchKeys = pendingMatchKeysByLeague.get(
        match.league.externalId,
      );
      if (!pendingMatchKeys) {
        pendingMatchKeys = new Set();
        pendingMatchKeysByLeague.set(match.league.externalId, pendingMatchKeys);
      }

      pendingMatchKeys.add(
        createLegaMatchLookupKey(
          match.league.externalId,
          match.homeTeam.name,
          match.awayTeam.name,
          match.scheduledAt,
        ),
      );
      pendingMatchKeys.add(
        createLegaMatchLookupKey(
          match.league.externalId,
          match.homeTeam.name,
          match.awayTeam.name,
          null,
        ),
      );
    }

    if (!pendingMatches.length) {
      this.logger.log('No pending LegaVolley match statistics found');
      return;
    }

    this.logger.log(
      `Starting LegaVolley statistics synchronization for ` +
        `${pendingMatches.length} pending matches`,
    );

    const [statisticsById, resolvedStatistics] = await Promise.all([
      this.gateway.fetchMatchStatisticsByIds(matchesWithExternalId),
      pendingMatchKeysByYearAndLeague.size
        ? this.gateway.fetchPendingMatchStatistics(
            pendingMatchKeysByYearAndLeague,
          )
        : Promise.resolve([]),
    ]);
    const rows = await this.playerStatisticsService.upsertLegaMatchStatistics([
      ...statisticsById,
      ...resolvedStatistics,
    ]);

    this.logger.log(`LegaVolley match statistics synchronized: ${rows} rows`);
  }

  private getTeamStages<T extends { seasonName?: string }>(
    stages: T[],
    includeHistoricalTeams: boolean,
  ): T[] {
    if (includeHistoricalTeams) {
      return stages;
    }

    const currentYear = new Date().getFullYear();
    return stages.filter(({ seasonName }) => {
      const seasonStartYear = Number(seasonName?.slice(0, 4));
      return (
        Number.isInteger(seasonStartYear) && seasonStartYear >= currentYear
      );
    });
  }
}
