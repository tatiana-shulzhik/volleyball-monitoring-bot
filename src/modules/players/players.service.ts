import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { PlayersEntity } from '../../databases/entities/players.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { MatchPlayerAttackStatisticsRepository } from '../../databases/repositories/match-player-attack-statistics.repository';
import { IFetchedPlayers } from '../../interfaces/requests/players.interface';
import { IPlayerRosterSource } from '../../interfaces/responses/synchronized-teams.interface';
import { ITeamStatistics } from '../../interfaces/responses/team-statistics.interface';
import { ILegaPlayer } from '../../interfaces/requests/lega-volley.interface';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import { createTeamStatistics } from '../../shared/player-statistics.utils';
import {
  calculatePlayerChanges,
  calculatePlayerRelationChanges,
} from '../../shared/players.utils';
import { applyRelationChanges } from '../../shared/relation-changes.utils';
import {
  applyEntityChanges,
  logEntityChanges,
} from '../../shared/synchronization.utils';
import { ESourceCode } from '../../shared/enums';
import { splitIntoBatches, uniqueBy } from '../../shared/array.utils';
import { normalizePlayerName } from '../../shared/player-name.utils';

@Injectable()
export class PlayersService {
  private readonly logger = new Logger(PlayersService.name);

  constructor(
    private readonly playersRepository: PlayersRepository,
    private readonly relationsRepository: PlayerTeamLeaguesRepository,
    private readonly teamsRepository: TeamsRepository,
    private readonly matchAttacksRepository: MatchPlayerAttackStatisticsRepository,
  ) {}

  async getBirthYearsByExternalIds(
    externalIds: string[],
    sourceCode: ESourceCode,
  ): Promise<Map<string, number>> {
    if (!externalIds.length) return new Map();

    const players = await this.playersRepository.getWhere({
      externalId: In([...new Set(externalIds)]),
      source: { code: sourceCode },
    });
    return new Map(
      players.flatMap(({ externalId, birthYear }) =>
        birthYear === null ? [] : [[externalId, birthYear] as const],
      ),
    );
  }

  async upsertCatalogPlayers(
    incomingPlayers: ILegaPlayer[],
    teamsByExternalId: Map<string, TeamEntity>,
    leaguesByExternalId: Map<number, LeaguesEntity>,
    sourceCode: ESourceCode,
    preserveStoredNames = false,
    removeObsoleteRelations = false,
    relationScopes?: Array<{ team: TeamEntity; league: LeaguesEntity }>,
  ): Promise<number> {
    const players = uniqueBy(incomingPlayers, (player) => player.externalId);
    const storedPlayersByExternalId = preserveStoredNames
      ? new Map(
          (
            await this.playersRepository.getWhere({
              source: { code: sourceCode },
            })
          ).map((player) => [player.externalId, player]),
        )
      : new Map<string, PlayersEntity>();
    await this.playersRepository.updateMany(
      players.map((player) => {
        const stored = storedPlayersByExternalId.get(player.externalId);
        return stored
          ? {
              ...player,
              fullName: stored.fullName,
              birthYear: player.birthYear ?? stored.birthYear,
            }
          : player;
      }),
      undefined,
      sourceCode,
    );
    const playersByExternalId = new Map(
      (
        await this.playersRepository.getWhere({
          source: { code: sourceCode },
        })
      ).map((player) => [player.externalId, player]),
    );
    const scopedRelations =
      relationScopes ??
      [...teamsByExternalId.values()].flatMap((team) =>
        [...leaguesByExternalId.values()].map((league) => ({ team, league })),
      );
    const teamIds = [...new Set(scopedRelations.map(({ team }) => team.id))];
    const leagueIds = [
      ...new Set(scopedRelations.map(({ league }) => league.id)),
    ];
    const scopeKeys = new Set(
      scopedRelations.map(({ team, league }) => `${team.id}:${league.id}`),
    );
    const existingRelations = (
      teamIds.length && leagueIds.length
        ? await this.relationsRepository.getWhere({
            team: { id: In(teamIds) },
            league: { id: In(leagueIds) },
          })
        : []
    ).filter(({ team, league }) => scopeKeys.has(`${team.id}:${league.id}`));
    const existingRelationsByKey = new Map(
      existingRelations.map((relation) => [
        `${relation.player.id}:${relation.team.id}:${relation.league.id}`,
        relation,
      ]),
    );
    const relations = uniqueBy(
      incomingPlayers.flatMap((incoming) => {
        const player = playersByExternalId.get(incoming.externalId);
        const team = teamsByExternalId.get(incoming.teamExternalId);
        const league = leaguesByExternalId.get(incoming.leagueExternalId);

        if (!player || !team || !league) return [];

        const existing = existingRelationsByKey.get(
          `${player.id}:${team.id}:${league.id}`,
        );
        return [
          {
            player,
            team,
            league,
            shirtNumber: incoming.shirtNumber ?? existing?.shirtNumber ?? null,
            position: incoming.position ?? existing?.position ?? null,
          },
        ];
      }),
      ({ player, team, league }) => `${player.id}:${team.id}:${league.id}`,
    );
    if (!removeObsoleteRelations) {
      for (const batch of splitIntoBatches(relations)) {
        await this.relationsRepository.updateMany(batch);
      }
      return players.length;
    }

    const changes = calculatePlayerRelationChanges({
      incoming: incomingPlayers.map((player) => ({
        ...player,
        position: player.position ?? '',
      })),
      existing: existingRelations,
      playersByExternalId,
      teamsByExternalId,
      leaguesByExternalId,
    });
    await applyRelationChanges({
      transactionOwner: this.playersRepository,
      repository: this.relationsRepository,
      changes,
      allowDeletion: true,
    });

    return players.length;
  }

  async resolveSyntheticPlayersByFullName(
    incoming: ILegaPlayer[],
    sourceCode: ESourceCode,
  ): Promise<ILegaPlayer[]> {
    const playersByName = new Map<string, PlayersEntity[]>();
    for (const player of await this.playersRepository.getWhere({
      source: { code: sourceCode },
    })) {
      const key = normalizePlayerName(player.fullName);
      const players = playersByName.get(key) ?? [];
      players.push(player);
      playersByName.set(key, players);
    }

    return incoming.map((player) => {
      if (!player.externalId.includes(':synthetic:')) return player;

      const matches = playersByName.get(normalizePlayerName(player.fullName));
      return matches?.length === 1
        ? { ...player, externalId: matches[0].externalId }
        : player;
    });
  }

  async findTeamStatistics(
    teamId: number,
    leagueId: number,
    aggregateSeasons?: Array<{ id: number; name: string }>,
  ): Promise<ITeamStatistics | null> {
    const relations = await this.relationsRepository.getWhere({
      team: { id: teamId },
      league: { id: leagueId },
    });

    if (!relations.length) {
      return null;
    }

    const { team, league } = relations[0];
    const { stage } = league;
    const { season, championship } = stage;

    if (!season) {
      return null;
    }

    const sourceCode = championship.source?.code ?? ESourceCode.Cev;
    const isLegaVolley =
      sourceCode === ESourceCode.LegaVolley ||
      sourceCode === ESourceCode.LegaVolleyFemminile;

    if (
      aggregateSeasons?.length &&
      !aggregateSeasons.some(({ id }) => id === season.id)
    ) {
      aggregateSeasons = [season, ...aggregateSeasons].slice(
        0,
        PREVIOUS_YEARS_COUNT,
      );
    }

    const isAggregate = Boolean(aggregateSeasons?.length);
    const selectedSeasonIds = isAggregate
      ? aggregateSeasons!.map(({ id }) => id)
      : [season.id];
    let displayedRelations = relations;

    if (isLegaVolley && !isAggregate) {
      displayedRelations = await this.relationsRepository.getWhere({
        team: { id: team.id },
        league: {
          stage: {
            season: { id: In(selectedSeasonIds) },
            championship: {
              competitionType: championship.competitionType,
              source: { code: sourceCode },
            },
          },
        },
      });
    } else if (isAggregate) {
      displayedRelations = await this.relationsRepository.getWhere({
        player: {
          id: In(relations.map(({ player }) => player.id)),
        },
        league: {
          stage: {
            season: { id: In(selectedSeasonIds) },
            championship: {
              competitionType: championship.competitionType,
              source: { code: sourceCode },
            },
          },
        },
      });
    }

    const playerIds = [
      ...new Set(displayedRelations.map(({ player }) => player.id)),
    ];
    const championshipIds = [
      ...new Set(
        displayedRelations.map(({ league }) => league.stage.championship.id),
      ),
    ];
    const relationSeasonIds = [
      ...new Set(
        displayedRelations.flatMap(({ league }) =>
          league.stage.season ? [league.stage.season.id] : [],
        ),
      ),
    ];
    const attacks =
      championshipIds.length && playerIds.length
        ? await this.matchAttacksRepository.aggregateByChampionshipIds(
            championshipIds,
            playerIds,
            isLegaVolley ? relationSeasonIds : undefined,
          )
        : [];
    const result = createTeamStatistics(
      displayedRelations,
      attacks,
      sourceCode,
    );

    if (!result) {
      return null;
    }

    if (isLegaVolley || isAggregate) {
      result.teamName = team.name;
      result.country = team.country;
    }

    if (isLegaVolley) {
      result.championshipName = 'Все чемпионаты';
    }

    if (isAggregate) {
      result.seasonName = aggregateSeasons!
        .map(({ name }) => name)
        .sort((left, right) => right.localeCompare(left))
        .join('–');
      result.teamSeasonName = season.name;
    }

    return result;
  }

  async synchronize(
    sources: IPlayerRosterSource[],
    fetched: IFetchedPlayers,
  ): Promise<void> {
    if (!sources.length) {
      this.logger.warn('No roster sources found; players sync skipped');
      return;
    }

    this.logger.log(
      `Starting players synchronization for ${sources.length} rosters`,
    );

    await this.teamsRepository.updateCountries(
      fetched.teamCountries.map(({ teamExternalId, country }) => ({
        externalId: teamExternalId,
        country,
      })),
    );
    const externalIds = [
      ...new Set(fetched.players.map(({ externalId }) => externalId)),
    ];
    const existingPlayers = externalIds.length
      ? await this.playersRepository.getWhere({
          externalId: In(externalIds),
          source: { code: ESourceCode.Cev },
        })
      : [];
    const calculatedChanges = calculatePlayerChanges({
      incoming: fetched.players,
      existing: existingPlayers,
    });
    const playerChanges = { ...calculatedChanges, obsoleteIds: [] };

    await applyEntityChanges({
      repository: this.playersRepository,
      changes: playerChanges,
      allowDeletion: false,
    });

    const players = externalIds.length
      ? await this.playersRepository.getWhere({
          externalId: In(externalIds),
          source: { code: ESourceCode.Cev },
        })
      : [];
    const teams = [
      ...new Map(sources.map(({ team }) => [team.externalId, team])).values(),
    ];
    const leagues = [
      ...new Map(
        sources.map(({ league }) => [league.externalId, league]),
      ).values(),
    ];
    const sourceKeys = new Set(
      sources.map(({ team, league }) => `${team.id}:${league.id}`),
    );
    const existingRelations = (
      await this.relationsRepository.getWhere({
        team: { id: In(teams.map(({ id }) => id)) },
        league: { id: In(leagues.map(({ id }) => id)) },
      })
    ).filter(({ team, league }) => sourceKeys.has(`${team.id}:${league.id}`));
    const relationChanges = calculatePlayerRelationChanges({
      incoming: fetched.players,
      existing: existingRelations,
      playersByExternalId: new Map(
        players.map((player) => [player.externalId, player]),
      ),
      teamsByExternalId: new Map(teams.map((team) => [team.externalId, team])),
      leaguesByExternalId: new Map(
        leagues.map((league) => [league.externalId, league]),
      ),
    });

    await applyRelationChanges({
      transactionOwner: this.playersRepository,
      repository: this.relationsRepository,
      changes: relationChanges,
      allowDeletion: fetched.isComplete,
    });

    logEntityChanges({
      logger: this.logger,
      entityName: 'Players',
      changes: playerChanges,
      isComplete: fetched.isComplete,
      allowDeletion: false,
    });
    this.logger.log(
      `Player team leagues synchronized: ${relationChanges.missing.length} inserted, ` +
        `${relationChanges.changed.length} updated, ` +
        `${fetched.isComplete ? relationChanges.obsoleteIds.length : 0} deleted`,
    );
  }
}
