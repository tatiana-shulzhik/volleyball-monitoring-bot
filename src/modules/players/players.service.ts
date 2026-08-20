import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { MatchPlayerAttackStatisticsRepository } from '../../databases/repositories/match-player-attack-statistics.repository';
import { LegaMatchPlayerStatisticsRepository } from '../../databases/repositories/lega-match-player-statistics.repository';
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

@Injectable()
export class PlayersService {
  private readonly logger = new Logger(PlayersService.name);

  constructor(
    private readonly playersRepository: PlayersRepository,
    private readonly relationsRepository: PlayerTeamLeaguesRepository,
    private readonly teamsRepository: TeamsRepository,
    private readonly matchAttacksRepository: MatchPlayerAttackStatisticsRepository,
    private readonly legaMatchStatisticsRepository: LegaMatchPlayerStatisticsRepository,
  ) {}

  async upsertCatalogPlayers(
    incomingPlayers: ILegaPlayer[],
    teamsByExternalId: Map<string, TeamEntity>,
    leaguesByExternalId: Map<number, LeaguesEntity>,
    sourceCode: ESourceCode,
  ): Promise<number> {
    const players = uniqueBy(incomingPlayers, (player) => player.externalId);
    await this.playersRepository.updateMany(players, undefined, sourceCode);
    const playersByExternalId = new Map(
      (
        await this.playersRepository.getWhere({
          source: { code: sourceCode },
        })
      ).map((player) => [player.externalId, player]),
    );
    const relations = uniqueBy(
      incomingPlayers.flatMap((incoming) => {
        const player = playersByExternalId.get(incoming.externalId);
        const team = teamsByExternalId.get(incoming.teamExternalId);
        const league = leaguesByExternalId.get(incoming.leagueExternalId);

        return player && team && league
          ? [
              {
                player,
                team,
                league,
                shirtNumber: incoming.shirtNumber,
                position: incoming.position,
              },
            ]
          : [];
      }),
      ({ player, team, league }) => `${player.id}:${team.id}:${league.id}`,
    );
    for (const batch of splitIntoBatches(relations)) {
      await this.relationsRepository.updateMany(batch);
    }

    return players.length;
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
    const seasonId = league.stage.season?.id;
    const sourceCode =
      league.stage.championship.source?.code ?? ESourceCode.Cev;

    if (!seasonId) {
      return null;
    }

    if (
      aggregateSeasons?.length &&
      !aggregateSeasons.some(({ id }) => id === seasonId)
    ) {
      aggregateSeasons = [league.stage.season!, ...aggregateSeasons].slice(
        0,
        PREVIOUS_YEARS_COUNT,
      );
    }

    const isAggregate = Boolean(aggregateSeasons?.length);
    const displayedRelations = isAggregate
      ? await this.relationsRepository.getWhere({
          player: {
            id: In(relations.map(({ player }) => player.id)),
          },
          league: {
            stage: {
              season: { id: In(aggregateSeasons!.map(({ id }) => id)) },
              championship: {
                competitionType: league.stage.championship.competitionType,
                source: { code: sourceCode },
              },
            },
          },
        })
      : relations;

    const playerIds = [
      ...new Set(displayedRelations.map(({ player }) => player.id)),
    ];
    const championshipIds = [
      ...new Set(
        displayedRelations.map(({ league }) => league.stage.championship.id),
      ),
    ];
    const attacks =
      championshipIds.length && playerIds.length
        ? sourceCode === ESourceCode.LegaVolley
          ? await this.legaMatchStatisticsRepository.aggregateByChampionshipIds(
              championshipIds,
              playerIds,
            )
          : await this.matchAttacksRepository.aggregateByChampionshipIds(
              championshipIds,
              playerIds,
            )
        : [];
    const result = createTeamStatistics(
      displayedRelations,
      attacks,
      sourceCode,
    );

    if (result && aggregateSeasons?.length) {
      result.seasonName = aggregateSeasons
        .map(({ name }) => name)
        .sort((left, right) => right.localeCompare(left))
        .join('–');
      result.teamSeasonName = league.stage.season?.name ?? '—';
      result.teamName = team.name;
      result.country = team.country;
      result.championshipName = 'Все чемпионаты';
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
      ? await this.playersRepository.getWhere({ externalId: In(externalIds) })
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
      ? await this.playersRepository.getWhere({ externalId: In(externalIds) })
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
