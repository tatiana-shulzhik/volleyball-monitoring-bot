import { Injectable, Logger } from '@nestjs/common';
import { PlayerTeamSeasonsRepository } from '../../databases/repositories/player-team-seasons.repository';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { PlayerRosterSource } from '../../interfaces/responses/synchronized-teams.interface';
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
    private readonly relationsRepository: PlayerTeamSeasonsRepository,
  ) {}

  async synchronize(sources: PlayerRosterSource[]): Promise<void> {
    if (!sources.length) {
      this.logger.warn('No roster sources found; players sync skipped');
      return;
    }

    this.logger.log(
      `Starting players synchronization for ${sources.length} rosters`,
    );

    const fetched = await this.gateway.fetchPlayers(sources);
    const externalIds = [
      ...new Set(fetched.players.map(({ externalId }) => externalId)),
    ];
    const existingPlayers = externalIds.length
      ? await this.playersRepository.findByExternalIds(externalIds)
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
      ? await this.playersRepository.findByExternalIds(externalIds)
      : [];
    const teams = [
      ...new Map(sources.map(({ team }) => [team.externalId, team])).values(),
    ];
    const seasons = [
      ...new Map(
        sources.map(({ season }) => [season.externalId, season]),
      ).values(),
    ];
    const sourceKeys = new Set(
      sources.map(({ team, season }) => `${team.id}:${season.id}`),
    );
    const existingRelations = (
      await this.relationsRepository.findByTeamIdsAndSeasonIds(
        teams.map(({ id }) => id),
        seasons.map(({ id }) => id),
      )
    ).filter(({ team, season }) => sourceKeys.has(`${team.id}:${season.id}`));
    const relationChanges = calculatePlayerRelationChanges({
      incoming: fetched.players,
      existing: existingRelations,
      playersByExternalId: new Map(
        players.map((player) => [player.externalId, player]),
      ),
      teamsByExternalId: new Map(teams.map((team) => [team.externalId, team])),
      seasonsByExternalId: new Map(
        seasons.map((season) => [season.externalId, season]),
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
      `Player team seasons synchronized: ${relationChanges.missing.length} inserted, ` +
        `${fetched.isComplete ? relationChanges.obsoleteIds.length : 0} deleted`,
    );
  }
}
