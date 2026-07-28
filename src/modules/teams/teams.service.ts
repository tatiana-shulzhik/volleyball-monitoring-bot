import { Injectable, Logger } from '@nestjs/common';
import { TeamEntity } from '../../databases/entities/team.entity';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { SynchronizeTeamsParams } from '../../interfaces/requests/teams.interface';
import {
  IPlayerRosterSource,
  ISynchronizedTeams,
} from '../../interfaces/responses/synchronized-teams.interface';
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

  async synchronize(data: SynchronizeTeamsParams): Promise<ISynchronizedTeams> {
    const { leagues, teams: incomingTeams, isComplete } = data;

    if (!leagues.length) {
      this.logger.warn('No leagues found; teams sync skipped');
      return { teams: [], rosterSources: [] };
    }

    this.logger.log(
      `Starting teams synchronization for ${leagues.length} leagues`,
    );

    const externalIds = [
      ...new Set(incomingTeams.map(({ externalId }) => externalId)),
    ];
    const existingTeams = externalIds.length
      ? await this.teamsRepository.findByExternalIds(externalIds)
      : [];
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

    return {
      teams,
      rosterSources: this.createRosterSources({
        incomingTeams,
        teams,
        leagues,
      }),
    };
  }

  private createRosterSources(data: {
    incomingTeams: SynchronizeTeamsParams['teams'];
    teams: TeamEntity[];
    leagues: SynchronizeTeamsParams['leagues'];
  }): IPlayerRosterSource[] {
    const { incomingTeams, teams, leagues } = data;
    const teamsByExternalId = new Map(
      teams.map((team) => [team.externalId, team]),
    );
    const leaguesByExternalId = new Map(
      leagues.map((league) => [league.externalId, league]),
    );
    const sources = new Map<string, IPlayerRosterSource>();

    for (const incomingTeam of incomingTeams) {
      const team = teamsByExternalId.get(incomingTeam.externalId);
      const league = leaguesByExternalId.get(incomingTeam.leagueExternalId);
      const season = league?.championship.season;

      if (team && league && season) {
        sources.set(`${team.externalId}:${league.externalId}`, {
          team,
          league,
          season,
        });
      }
    }

    return [...sources.values()];
  }
}
