import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { SourcesEntity } from '../../databases/entities/sources.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { TeamLeagueEntity } from '../../databases/entities/team-league.entity';
import { PlayersEntity } from '../../databases/entities/players.entity';
import { PlayerTeamLeagueEntity } from '../../databases/entities/player-team-league.entity';
import { MatchEntity } from '../../databases/entities/match.entity';
import { LegaMatchPlayerStatisticsRepository } from '../../databases/repositories/lega-match-player-statistics.repository';
import { LegaVolleyGateway } from '../../gateway/lega-volley.gateway';
import { ESourceCode } from '../../shared/enums';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import {
  createLegaMatchKey,
  normalizeLegaName,
} from '../../shared/lega-volley.utils';

@Injectable()
export class LegaVolleyCatalogService {
  private readonly logger = new Logger(LegaVolleyCatalogService.name);

  constructor(
    private readonly gateway: LegaVolleyGateway,
    private readonly dataSource: DataSource,
    private readonly legaMatchStatisticsRepository: LegaMatchPlayerStatisticsRepository,
  ) {}

  async synchronizeStoredRange(): Promise<void> {
    await this.synchronizeFrom(
      new Date().getFullYear() - PREVIOUS_YEARS_COUNT,
      true,
    );
  }

  async synchronizeCurrentAndFuture(): Promise<void> {
    await this.synchronizeFrom(new Date().getFullYear(), false);
  }

  async synchronizeCurrentAndFutureMatches(): Promise<void> {
    const currentYear = new Date().getFullYear();
    const source = await this.dataSource
      .getRepository(SourcesEntity)
      .findOneByOrFail({ code: ESourceCode.LegaVolley });
    const leagues = await this.dataSource.getRepository(LeaguesEntity).find({
      where: { stage: { championship: { source: { id: source.id } } } },
      relations: { stage: { season: true } },
    });
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

    const fetched = await this.gateway.fetchMatches(schedules);
    const teams = await this.dataSource.getRepository(TeamEntity).find({
      where: { source: { id: source.id } },
    });
    const leaguesByExternalId = new Map(
      leagues.map((league) => [league.externalId, league]),
    );
    const teamsByExternalId = new Map(
      teams.map((team) => [team.externalId, team]),
    );
    const matches = [
      ...new Map(
        fetched.matches.map((match) => [match.externalId, match]),
      ).values(),
    ];

    await this.dataSource.getRepository(MatchEntity).upsert(
      matches.flatMap((match) => {
        const league = leaguesByExternalId.get(match.leagueExternalId);
        const homeTeam = teamsByExternalId.get(match.homeTeamExternalId);
        const awayTeam = teamsByExternalId.get(match.awayTeamExternalId);
        return league && homeTeam && awayTeam
          ? [
              {
                externalId: match.externalId,
                league,
                homeTeam,
                awayTeam,
                scheduledAt: match.scheduledAt,
                status: match.status,
              },
            ]
          : [];
      }),
      { conflictPaths: ['externalId'], skipUpdateIfNoValuesChanged: true },
    );

    this.logger.log(
      `LegaVolley matches synchronized: ${matches.length} matches, ` +
        `${fetched.isComplete ? 'complete' : 'partially complete'}`,
    );
  }

  async synchronizeMatchStatisticsStoredRange(): Promise<void> {
    await this.synchronizeMatchStatisticsSince(
      new Date().getFullYear() - PREVIOUS_YEARS_COUNT,
    );
  }

  async synchronizeCurrentMatchStatistics(): Promise<void> {
    await this.synchronizeMatchStatisticsSince(new Date().getFullYear());
  }

  private async synchronizeMatchStatisticsSince(
    earliestYear: number,
  ): Promise<void> {
    const source = await this.dataSource
      .getRepository(SourcesEntity)
      .findOneByOrFail({ code: ESourceCode.LegaVolley });
    const [teams, players, matches, fetched] = await Promise.all([
      this.dataSource
        .getRepository(TeamEntity)
        .find({ where: { source: { id: source.id } } }),
      this.dataSource
        .getRepository(PlayersEntity)
        .find({ where: { source: { id: source.id } } }),
      this.dataSource.getRepository(MatchEntity).find({
        where: {
          league: { stage: { championship: { source: { id: source.id } } } },
        },
        relations: { league: true, homeTeam: true, awayTeam: true },
      }),
      this.gateway.fetchMatchStatisticsSince(earliestYear),
    ]);
    const teamsByName = new Map(
      teams.map((team) => [normalizeLegaName(team.name), team]),
    );
    const playersByExternalId = new Map(
      players.map((player) => [player.externalId, player]),
    );
    const matchesByKey = new Map(
      matches.map((match) => [
        createLegaMatchKey(
          match.league.externalId,
          match.homeTeam.externalId,
          match.awayTeam.externalId,
          match.scheduledAt,
        ),
        match,
      ]),
    );
    const sourceUpdatedAt = new Date();
    const rows: Parameters<
      LegaMatchPlayerStatisticsRepository['upsertMany']
    >[0] = [];

    for (const statistics of fetched) {
      const homeTeam = teamsByName.get(
        normalizeLegaName(statistics.homeTeamName),
      );
      const awayTeam = teamsByName.get(
        normalizeLegaName(statistics.awayTeamName),
      );
      if (!homeTeam || !awayTeam) continue;
      const match = matchesByKey.get(
        createLegaMatchKey(
          statistics.leagueExternalId,
          homeTeam.externalId,
          awayTeam.externalId,
          statistics.playedOn,
        ),
      );
      if (!match) continue;
      for (const [team, playersStatistics] of [
        [homeTeam, statistics.home],
        [awayTeam, statistics.away],
      ] as const) {
        for (const statistic of playersStatistics) {
          const player = playersByExternalId.get(statistic.externalId);
          if (player)
            rows.push({
              match,
              team,
              player,
              points: statistic.points,
              shirtNumber: statistic.shirtNumber,
              played: statistic.played,
              sourceUpdatedAt,
            });
        }
      }
    }
    if (rows.length) {
      await this.legaMatchStatisticsRepository.upsertMany(rows);
    }
    this.logger.log(
      `LegaVolley match statistics synchronized: ${rows.length} rows`,
    );
  }

  private async synchronizeFrom(
    earliestYear: number,
    includeHistoricalTeams: boolean,
  ): Promise<void> {
    const catalog = await this.gateway.fetchSeasonCatalogSince(earliestYear);
    const source = await this.dataSource
      .getRepository(SourcesEntity)
      .findOneByOrFail({ code: ESourceCode.LegaVolley });
    const seasonsRepository = this.dataSource.getRepository(SeasonsEntity);
    const championshipsRepository =
      this.dataSource.getRepository(ChampionshipsEntity);
    const stagesRepository = this.dataSource.getRepository(
      CompetitionStagesEntity,
    );
    const leaguesRepository = this.dataSource.getRepository(LeaguesEntity);

    await seasonsRepository.upsert(
      [
        ...new Map(
          catalog.stages.flatMap(({ seasonName }) =>
            seasonName ? [[seasonName, { name: seasonName }] as const] : [],
          ),
        ).values(),
      ],
      { conflictPaths: ['name'], skipUpdateIfNoValuesChanged: true },
    );
    const seasons = await seasonsRepository.find();
    const seasonsByName = new Map(
      seasons.map((season) => [season.name, season]),
    );

    await championshipsRepository.upsert(
      catalog.championships.map((championship) => ({
        ...championship,
        source,
      })),
      { conflictPaths: ['externalId'], skipUpdateIfNoValuesChanged: true },
    );
    const championships = await championshipsRepository.find({
      where: { source: { id: source.id } },
    });
    const championshipsByExternalId = new Map(
      championships.map((championship) => [
        championship.externalId,
        championship,
      ]),
    );

    await stagesRepository.upsert(
      catalog.stages.map((stage) => ({
        externalId: stage.externalId,
        name: stage.name,
        startsAt: stage.startsAt ?? null,
        endsAt: stage.endsAt ?? null,
        season: stage.seasonName
          ? (seasonsByName.get(stage.seasonName) ?? null)
          : null,
        championship: championshipsByExternalId.get(
          stage.championshipExternalId,
        ),
      })),
      {
        conflictPaths: ['externalId', 'championship'],
        skipUpdateIfNoValuesChanged: true,
      },
    );
    const stages = await stagesRepository.find({
      where: { championship: { source: { id: source.id } } },
      relations: { championship: true, season: true },
    });
    const stageByKey = new Map(
      stages.map((stage) => [
        `${stage.championship.externalId}:${stage.externalId}`,
        stage,
      ]),
    );

    const currentYear = new Date().getFullYear();
    const teamStages = includeHistoricalTeams
      ? catalog.stages
      : catalog.stages.filter(({ seasonName }) => {
          const seasonStartYear = Number(seasonName?.slice(0, 4));
          return (
            Number.isInteger(seasonStartYear) && seasonStartYear >= currentYear
          );
        });
    const leagueCatalog = await this.gateway.fetchLeagueCatalog(teamStages);
    const uniqueLeagues = [
      ...new Map(
        leagueCatalog.leagues.map((league) => [
          `${league.externalId}:${league.championshipExternalId}:${league.stageExternalId}`,
          league,
        ]),
      ).values(),
    ];
    await leaguesRepository.upsert(
      uniqueLeagues.map((league) => ({
        externalId: league.externalId,
        name: league.name,
        stage: stageByKey.get(
          `${league.championshipExternalId}:${league.stageExternalId}`,
        ),
      })),
      {
        conflictPaths: ['externalId', 'stage'],
        skipUpdateIfNoValuesChanged: true,
      },
    );

    const storedLeagues = await leaguesRepository.find({
      where: { stage: { championship: { source: { id: source.id } } } },
      relations: { stage: true },
    });
    const leaguesByExternalId = new Map(
      storedLeagues.map((league) => [league.externalId, league]),
    );
    const teamsRepository = this.dataSource.getRepository(TeamEntity);
    const uniqueTeams = [
      ...new Map(
        leagueCatalog.teams.map((team) => [team.externalId, team]),
      ).values(),
    ];
    await teamsRepository.upsert(
      uniqueTeams.map((team) => ({
        externalId: team.externalId,
        name: team.name,
        country: team.country ?? 'ITA',
        source,
      })),
      { conflictPaths: ['externalId'], skipUpdateIfNoValuesChanged: true },
    );
    const storedTeams = await teamsRepository.find({
      where: { source: { id: source.id } },
    });
    const teamsByExternalId = new Map(
      storedTeams.map((team) => [team.externalId, team]),
    );
    const uniqueTeamLeagues = [
      ...new Map(
        leagueCatalog.teams
          .map((team) => {
            const storedTeam = teamsByExternalId.get(team.externalId);
            const league = leaguesByExternalId.get(team.leagueExternalId);
            return storedTeam && league
              ? [`${storedTeam.id}:${league.id}`, { team: storedTeam, league }]
              : null;
          })
          .filter(
            (
              value,
            ): value is [string, { team: TeamEntity; league: LeaguesEntity }] =>
              value !== null,
          ),
      ).values(),
    ];
    await this.dataSource
      .getRepository(TeamLeagueEntity)
      .upsert([...uniqueTeamLeagues], {
        conflictPaths: ['team', 'league'],
        skipUpdateIfNoValuesChanged: true,
      });

    const uniquePlayers = [
      ...new Map(
        (leagueCatalog.players ?? []).map((player) => [
          player.externalId,
          player,
        ]),
      ).values(),
    ];
    const playersRepository = this.dataSource.getRepository(PlayersEntity);
    await playersRepository.upsert(
      uniquePlayers.map((player) => ({
        externalId: player.externalId,
        fullName: player.fullName,
        birthYear: player.birthYear,
        source,
      })),
      { conflictPaths: ['externalId'], skipUpdateIfNoValuesChanged: true },
    );
    const storedPlayers = await playersRepository.find({
      where: { source: { id: source.id } },
    });
    const playersByExternalId = new Map(
      storedPlayers.map((player) => [player.externalId, player]),
    );
    const playerTeamLeagueEntries = (leagueCatalog.players ?? []).flatMap(
      (player) => {
        const storedPlayer = playersByExternalId.get(player.externalId);
        const storedTeam = teamsByExternalId.get(player.teamExternalId);
        const league = leaguesByExternalId.get(player.leagueExternalId);
        return storedPlayer && storedTeam && league
          ? [
              [
                `${storedPlayer.id}:${storedTeam.id}:${league.id}`,
                {
                  player: storedPlayer,
                  team: storedTeam,
                  league,
                  shirtNumber: player.shirtNumber,
                  position: player.position,
                },
              ] as const,
            ]
          : [];
      },
    );
    const playerTeamLeagues = [...new Map(playerTeamLeagueEntries).values()];
    await this.dataSource
      .getRepository(PlayerTeamLeagueEntity)
      .upsert(playerTeamLeagues, {
        conflictPaths: ['player', 'team', 'league'],
        skipUpdateIfNoValuesChanged: true,
      });

    const matchesRepository = this.dataSource.getRepository(MatchEntity);
    const matches = [
      ...new Map(
        (leagueCatalog.matches ?? []).map((match) => [match.externalId, match]),
      ).values(),
    ];
    await matchesRepository.upsert(
      matches.flatMap((match) => {
        const league = leaguesByExternalId.get(match.leagueExternalId);
        const homeTeam = teamsByExternalId.get(match.homeTeamExternalId);
        const awayTeam = teamsByExternalId.get(match.awayTeamExternalId);
        return league && homeTeam && awayTeam
          ? [
              {
                externalId: match.externalId,
                league,
                homeTeam,
                awayTeam,
                scheduledAt: match.scheduledAt,
                status: match.status,
              },
            ]
          : [];
      }),
      { conflictPaths: ['externalId'], skipUpdateIfNoValuesChanged: true },
    );

    this.logger.log(
      `LegaVolley catalog synchronized: ${catalog.championships.length} championships, ` +
        `${catalog.stages.length} stages, ${uniqueTeams.length} teams, ` +
        `${uniquePlayers.length} players, ${matches.length} matches`,
    );
  }
}
