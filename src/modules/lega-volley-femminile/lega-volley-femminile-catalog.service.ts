import { Injectable, Logger } from '@nestjs/common';
import { LegaVolleyFemminileGateway } from '../../gateway/lega-volley-femminile.gateway';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { ICevMatch } from '../../interfaces/requests/matches.interface';
import { ESourceCode } from '../../shared/enums';
import { getEarliestCatalogYear } from '../../shared/season.utils';
import { ChampionshipsService } from '../championships/championships.service';
import { LeaguesService } from '../leagues/leagues.service';
import { MatchesService } from '../matches/matches.service';
import { PlayerStatisticsService } from '../players/player-statistics.service';
import { PlayersService } from '../players/players.service';
import { SeasonsService } from '../seasons/seasons.service';
import { TeamsService } from '../teams/teams.service';

@Injectable()
export class LegaVolleyFemminileCatalogService {
  private readonly logger = new Logger(LegaVolleyFemminileCatalogService.name);

  constructor(
    private readonly gateway: LegaVolleyFemminileGateway,
    private readonly seasonsService: SeasonsService,
    private readonly championshipsService: ChampionshipsService,
    private readonly leaguesService: LeaguesService,
    private readonly teamsService: TeamsService,
    private readonly matchesService: MatchesService,
    private readonly playersService: PlayersService,
    private readonly playerStatisticsService: PlayerStatisticsService,
  ) {}

  synchronizeStoredRange(): Promise<void> {
    return this.synchronizeFrom(getEarliestCatalogYear(), true);
  }

  synchronizeCurrentAndFuture(): Promise<void> {
    return this.synchronizeFrom(new Date().getFullYear(), true);
  }

  async synchronizeCurrentAndFutureMatches(): Promise<void> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const [leagues, teams] = await Promise.all([
      this.leaguesService.getBySource(ESourceCode.LegaVolleyFemminile),
      this.teamsService.getBySource(ESourceCode.LegaVolleyFemminile),
    ]);
    const schedules = leagues.flatMap((league) => {
      const year = Number(league.stage.season?.name.slice(0, 4));
      const isCurrentOrFuture = league.stage.endsAt
        ? league.stage.endsAt >= now
        : year >= currentYear;

      return Number.isInteger(year) && isCurrentOrFuture
        ? [{ year, leagueExternalId: league.externalId }]
        : [];
    });
    if (!schedules.length) {
      this.logger.log(
        'No current LegaVolleyFemminile leagues found for matches sync',
      );
      return;
    }

    const fetched = await this.gateway.fetchMatches(schedules);
    const matches = await this.matchesService.upsertCatalogMatches(
      fetched.matches,
      new Map(leagues.map((league) => [league.externalId, league])),
      new Map(teams.map((team) => [team.externalId, team])),
      ESourceCode.LegaVolleyFemminile,
    );

    this.logger.log(
      `LegaVolleyFemminile matches synchronized: ${matches} matches, ` +
        `${fetched.isComplete ? 'complete' : 'partially complete'}`,
    );
  }

  synchronizeMatchStatisticsStoredRange(): Promise<void> {
    return this.synchronizeMatchStatistics();
  }

  synchronizeCurrentMatchStatistics(): Promise<void> {
    return this.synchronizeMatchStatistics();
  }

  private async synchronizeFrom(
    earliestYear: number,
    includeRosters: boolean,
  ): Promise<void> {
    const catalog = await this.gateway.fetchCatalogSince(earliestYear);
    const seasonsByName = await this.seasonsService.upsertCatalogSeasons(
      catalog.stages,
    );
    const championshipsByExternalId =
      await this.championshipsService.upsertCatalogChampionships(
        catalog.championships,
        ESourceCode.LegaVolleyFemminile,
      );
    const stagesByKey = await this.championshipsService.upsertCatalogStages(
      catalog.stages,
      seasonsByName,
      championshipsByExternalId,
      ESourceCode.LegaVolleyFemminile,
    );
    const leaguesByExternalId = await this.leaguesService.upsertCatalogLeagues(
      catalog.leagues,
      stagesByKey,
      ESourceCode.LegaVolleyFemminile,
    );
    const teamsByExternalId = await this.teamsService.upsertCatalogTeams(
      catalog.teams,
      leaguesByExternalId,
      ESourceCode.LegaVolleyFemminile,
      'ITA',
    );
    const matches = await this.matchesService.upsertCatalogMatches(
      catalog.matches,
      leaguesByExternalId,
      teamsByExternalId,
      ESourceCode.LegaVolleyFemminile,
    );
    const synchronizedPlayers = includeRosters
      ? await this.synchronizeRosters(
          catalog.matches,
          teamsByExternalId,
          leaguesByExternalId,
        )
      : 0;

    this.logger.log(
      `LegaVolleyFemminile catalog synchronized: ${catalog.championships.length} championships, ` +
        `${catalog.stages.length} stages, ${catalog.leagues.length} leagues, ` +
        `${teamsByExternalId.size} teams, ${synchronizedPlayers} players, ` +
        `${matches} matches`,
    );
  }

  private async synchronizeRosters(
    matches: ICevMatch[],
    teamsByExternalId: Map<string, TeamEntity>,
    leaguesByExternalId: Map<number, LeaguesEntity>,
  ): Promise<number> {
    const coveredTeams = new Set<string>();
    const rosterMatchExternalIds: string[] = [];
    for (const match of matches) {
      const homeKey = `${match.leagueExternalId}:${match.homeTeamExternalId}`;
      const awayKey = `${match.leagueExternalId}:${match.awayTeamExternalId}`;
      if (coveredTeams.has(homeKey) && coveredTeams.has(awayKey)) continue;

      rosterMatchExternalIds.push(match.externalId);
      coveredTeams.add(homeKey);
      coveredTeams.add(awayKey);
    }

    const rosters = await this.gateway.fetchMatchRosters(
      rosterMatchExternalIds,
    );
    const matchesByExternalId = new Map(
      matches.map((match) => [match.externalId, match]),
    );
    const players = rosters.flatMap((roster) => {
      const match = matchesByExternalId.get(roster.matchExternalId);
      if (!match) return [];

      return [
        ...roster.home.map((player) => ({
          ...player,
          birthYear: null,
          teamExternalId: match.homeTeamExternalId,
          leagueExternalId: match.leagueExternalId,
        })),
        ...roster.away.map((player) => ({
          ...player,
          birthYear: null,
          teamExternalId: match.awayTeamExternalId,
          leagueExternalId: match.leagueExternalId,
        })),
      ];
    });

    return this.playersService.upsertCatalogPlayers(
      players,
      teamsByExternalId,
      leaguesByExternalId,
      ESourceCode.LegaVolleyFemminile,
    );
  }

  private async synchronizeMatchStatistics(): Promise<void> {
    const pendingMatches =
      await this.playerStatisticsService.findPendingLegaMatches(
        ESourceCode.LegaVolleyFemminile,
      );
    const pendingExternalIds = pendingMatches.flatMap(({ externalId }) =>
      externalId ? [externalId] : [],
    );
    if (!pendingExternalIds.length) {
      this.logger.log('No pending LegaVolleyFemminile match statistics found');
      return;
    }

    this.logger.log(
      `Starting LegaVolleyFemminile statistics synchronization for ` +
        `${pendingExternalIds.length} pending matches`,
    );
    const statistics =
      await this.gateway.fetchMatchStatistics(pendingExternalIds);
    const matchesByExternalId = new Map(
      pendingMatches.flatMap((match) =>
        match.externalId ? [[match.externalId, match] as const] : [],
      ),
    );
    const players = statistics.flatMap((item) => {
      const match = matchesByExternalId.get(item.matchExternalId);
      if (!match) return [];

      return [
        ...item.home.map((player) => ({
          ...player,
          birthYear: null,
          teamExternalId: match.homeTeam.externalId,
          leagueExternalId: match.league.externalId,
        })),
        ...item.away.map((player) => ({
          ...player,
          birthYear: null,
          teamExternalId: match.awayTeam.externalId,
          leagueExternalId: match.league.externalId,
        })),
      ];
    });
    const teamsByExternalId = new Map(
      pendingMatches.flatMap(({ homeTeam, awayTeam }) => [
        [homeTeam.externalId, homeTeam] as const,
        [awayTeam.externalId, awayTeam] as const,
      ]),
    );
    const leaguesByExternalId = new Map(
      pendingMatches.map(({ league }) => [league.externalId, league]),
    );
    const synchronizedPlayers = await this.playersService.upsertCatalogPlayers(
      players,
      teamsByExternalId,
      leaguesByExternalId,
      ESourceCode.LegaVolleyFemminile,
      true,
    );
    const rows =
      await this.playerStatisticsService.upsertLegaVolleyFemminileMatchStatistics(
        statistics,
      );

    this.logger.log(
      `LegaVolleyFemminile match statistics synchronized: ` +
        `${synchronizedPlayers} players, ${rows} rows`,
    );
  }
}
