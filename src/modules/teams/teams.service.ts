import { Injectable, Logger } from '@nestjs/common';
import { TeamEntity } from '../../databases/entities/team.entity';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { SynchronizeTeamsParams } from '../../interfaces/requests/teams.interface';
import { applyRelationChanges } from '../../shared/relation-changes.utils';
import {
  applyEntityChanges,
  logEntityChanges,
} from '../../shared/synchronization.utils';
import {
  calculateTeamChanges,
  calculateTeamLeagueChanges,
} from '../../shared/teams.utils';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly teamsRepository: TeamsRepository,
    private readonly teamLeaguesRepository: TeamLeaguesRepository,
  ) {}

  async synchronize(data: SynchronizeTeamsParams): Promise<TeamEntity[]> {
    const { leagues, teams: incomingTeams, isComplete } = data;

    if (!leagues.length) {
      this.logger.warn('No leagues found; teams sync skipped');
      return [];
    }

    this.logger.log(
      `Starting teams synchronization for ${leagues.length} leagues`,
    );

    const existingTeams = await this.teamsRepository.findAll();
    const calculatedChanges = calculateTeamChanges({
      incoming: incomingTeams,
      existing: existingTeams,
    });
    const teamChanges = { ...calculatedChanges, obsoleteIds: [] };

    await applyEntityChanges({
      repository: this.teamsRepository,
      changes: teamChanges,
      allowDeletion: false,
    });

    const externalIds = [
      ...new Set(incomingTeams.map(({ externalId }) => externalId)),
    ];
    const teams = externalIds.length
      ? await this.teamsRepository.findByExternalIds(externalIds)
      : [];
    const existingRelations = await this.teamLeaguesRepository.findByLeagueIds(
      leagues.map(({ id }) => id),
    );
    const relationChanges = calculateTeamLeagueChanges({
      incoming: incomingTeams,
      existing: existingRelations,
      teamsByExternalId: new Map(teams.map((team) => [team.externalId, team])),
      leaguesByExternalId: new Map(
        leagues.map((league) => [league.externalId, league]),
      ),
    });

    await applyRelationChanges({
      transactionOwner: this.teamsRepository,
      repository: this.teamLeaguesRepository,
      changes: relationChanges,
      allowDeletion: isComplete,
    });

    logEntityChanges({
      logger: this.logger,
      entityName: 'Teams',
      changes: teamChanges,
      isComplete,
      allowDeletion: false,
    });
    this.logger.log(
      `Team leagues synchronized: ${relationChanges.missing.length} inserted, ` +
        `${isComplete ? relationChanges.obsoleteIds.length : 0} deleted`,
    );

    return teams;
  }
}
