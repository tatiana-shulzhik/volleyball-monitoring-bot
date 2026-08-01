import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';
import { PlayerStatisticsRepository } from '../../databases/repositories/player-statistics.repository';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { IPlayerRosterSource } from '../../interfaces/responses/synchronized-teams.interface';
import { ITeamStatistics } from '../../interfaces/responses/team-statistics.interface';
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

@Injectable()
export class PlayersService {
  private readonly logger = new Logger(PlayersService.name);

  constructor(
    private readonly gateway: CevGateway,
    private readonly playersRepository: PlayersRepository,
    private readonly relationsRepository: PlayerTeamLeaguesRepository,
    private readonly statisticsRepository: PlayerStatisticsRepository,
    private readonly teamsRepository: TeamsRepository,
  ) {}

  async findTeamStatistics(
    teamId: number,
    leagueId: number,
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

    if (!seasonId) {
      return null;
    }

    const statistics = await this.statisticsRepository.getWhere({
      player: { id: In(relations.map(({ player }) => player.id)) },
      team: { id: team.id },
      stage: { season: { id: seasonId } },
    });

    return createTeamStatistics(relations, statistics);
  }

  async synchronize(sources: IPlayerRosterSource[]): Promise<void> {
    if (!sources.length) {
      this.logger.warn('No roster sources found; players sync skipped');
      return;
    }

    this.logger.log(
      `Starting players synchronization for ${sources.length} rosters`,
    );

    const fetched = await this.gateway.fetchPlayers(sources);
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
