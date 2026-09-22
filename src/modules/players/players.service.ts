import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { PlayersEntity } from '../../databases/entities/players.entity';
import type { PlayerTeamLeagueEntity } from '../../databases/entities/player-team-league.entity';
import { MatchPlayerAttackStatisticsRepository } from '../../databases/repositories/match-player-attack-statistics.repository';
import {
  IFetchedPlayers,
  IFindEquivalentTeamDataParams,
  IFindTeamStatisticsParams,
  IUpsertCatalogPlayersParams,
} from '../../interfaces/requests/players.interface';
import { IPlayerRosterSource } from '../../interfaces/responses/synchronized-teams.interface';
import { ITeamStatistics } from '../../interfaces/responses/team-statistics.interface';
import { ILegaPlayer } from '../../interfaces/requests/lega-volley.interface';
import { AGGREGATED_SEASONS_COUNT } from '../../shared/consts/constants';
import {
  createTeamStatistics,
  normalizeTeamName,
} from '../../shared/player-statistics.utils';
import {
  calculatePlayerChanges,
  calculatePlayerRelationChanges,
} from '../../shared/players.utils';
import { applyRelationChanges } from '../../shared/relation-changes.utils';
import { applyEntityChanges } from '../../shared/synchronization.utils';
import { ESourceCode } from '../../shared/enums';
import { splitIntoBatches, uniqueBy } from '../../shared/array.utils';
import { normalizePlayerName } from '../../shared/player-name.utils';
import { createTeamLeaguePairsQuery } from '../../shared/team-league.utils';
import {
  applyHistoricalRosterChanges,
  getRosterStatisticsInput,
} from '../../shared/team-roster-retro.utils';

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

  async findTeamPlayers(
    teamId: number,
    leagueId: number,
  ): Promise<Array<PlayersEntity & { shirtNumber: number | null }>> {
    const relations = await this.relationsRepository.getWhere({
      team: { id: teamId },
      league: { id: leagueId },
    });

    return relations
      .map(({ player, shirtNumber }) => ({ ...player, shirtNumber }))
      .sort(
        (left, right) =>
          (left.shirtNumber ?? Number.MAX_SAFE_INTEGER) -
            (right.shirtNumber ?? Number.MAX_SAFE_INTEGER) ||
          left.fullName.localeCompare(right.fullName),
      );
  }

  async upsertCatalogPlayers(
    data: IUpsertCatalogPlayersParams,
  ): Promise<number> {
    const {
      incomingPlayers,
      teamsByExternalId,
      leaguesByExternalId,
      sourceCode,
      preserveStoredNames = false,
      removeObsoleteRelations = false,
      relationScopes,
    } = data;

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
      uniqueBy(
        incomingPlayers.flatMap((player) => {
          const team = teamsByExternalId.get(player.teamExternalId);
          const league = leaguesByExternalId.get(player.leagueExternalId);

          return team && league ? [{ team, league }] : [];
        }),
        ({ team, league }) => `${team.id}:${league.id}`,
      );
    const pairsQuery = createTeamLeaguePairsQuery(
      scopedRelations.map(({ team, league }) => ({
        teamId: team.id,
        leagueId: league.id,
      })),
    );
    const existingRelations = pairsQuery
      ? await this.relationsRepository.getForTeamLeaguePairs(pairsQuery)
      : [];
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
    data: IFindTeamStatisticsParams,
  ): Promise<ITeamStatistics | null> {
    const {
      teamId,
      leagueId,
      aggregateSeasons,
      includeHistoricalRoster = false,
    } = data;

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

    const seasons =
      aggregateSeasons?.length &&
      !aggregateSeasons.some(({ id }) => id === season.id)
        ? [season, ...aggregateSeasons].slice(0, AGGREGATED_SEASONS_COUNT)
        : aggregateSeasons;

    const isAggregate = Boolean(seasons?.length);
    const selectedSeasonIds = isAggregate
      ? seasons!.map(({ id }) => id)
      : [season.id];
    const commonLeagueFilter = {
      stage: {
        season: { id: In(selectedSeasonIds) },
        championship: {
          competitionType: championship.competitionType,
          source: { code: sourceCode },
        },
      },
    };

    let displayedRelations = relations;
    let rosterRelations = relations;

    if (isLegaVolley && !isAggregate) {
      displayedRelations = await this.relationsRepository.getWhere({
        team: { id: team.id },
        league: commonLeagueFilter,
      });
    } else if (isAggregate) {
      if (includeHistoricalRoster) {
        const { teamIds } = await this.findEquivalentTeamData({
          team,
          sourceCode,
          competitionType: championship.competitionType,
          championshipName: championship.name,
        });

        rosterRelations = await this.relationsRepository.getWhere({
          team: { id: In(teamIds) },
          league: commonLeagueFilter,
        });
      }

      const sourceRelations = includeHistoricalRoster
        ? rosterRelations
        : relations;
      const playerIds = [
        ...new Set(sourceRelations.map(({ player }) => player.id)),
      ];

      displayedRelations = playerIds.length
        ? await this.relationsRepository.getWhere({
            player: { id: In(playerIds) },
            league: commonLeagueFilter,
          })
        : [];
    }

    const {
      playerIds,
      championshipIds,
      seasonIds: relationSeasonIds,
    } = getRosterStatisticsInput(displayedRelations);
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

    if (includeHistoricalRoster) {
      applyHistoricalRosterChanges(result, rosterRelations, season);
    }

    if (isAggregate) {
      result.seasonName = seasons!
        .map(({ name }) => name)
        .sort((left, right) => right.localeCompare(left))
        .join('–');
      result.teamSeasonName = season.name;
    }

    return result;
  }

  private async findEquivalentTeamData(
    params: IFindEquivalentTeamDataParams,
  ): Promise<{
    teamIds: number[];
    relations: PlayerTeamLeagueEntity[];
  }> {
    const { team, sourceCode, competitionType, championshipName } = params;
    const normalizedName = normalizeTeamName(team.name);
    const teams = await this.teamsRepository.getWhere({
      source: { code: sourceCode },
    });
    const candidateIds = teams
      .filter(
        (candidate) => normalizeTeamName(candidate.name) === normalizedName,
      )
      .map(({ id }) => id);

    const gender = championshipName.match(/\b(Men|Women)\b/i)?.[1];
    const relations = await this.relationsRepository.getWhere({
      team: { id: In(candidateIds) },
      league: {
        stage: {
          championship: {
            competitionType,
            source: { code: sourceCode },
          },
        },
      },
    });
    const matchingRelations = relations.filter(({ league }) => {
      if (!gender) return true;

      return new RegExp(`\\b${gender}\\b`, 'i').test(
        league.stage.championship.name,
      );
    });
    const teamIds = [
      ...new Set(
        matchingRelations.map(({ team: relatedTeam }) => relatedTeam.id),
      ),
    ];

    return teamIds.length
      ? { teamIds, relations: matchingRelations }
      : {
          teamIds: [team.id],
          relations: relations.filter(
            ({ team: relatedTeam }) => relatedTeam.id === team.id,
          ),
        };
  }

  async synchronize(
    sources: IPlayerRosterSource[],
    fetched: IFetchedPlayers,
  ): Promise<number> {
    if (!sources.length) {
      this.logger.warn('No roster sources found; players sync skipped');
      return 0;
    }

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

    return players.length;
  }
}
