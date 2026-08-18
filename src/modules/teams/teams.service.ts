import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { TeamEntity } from '../../databases/entities/team.entity';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { SynchronizeTeamsParams } from '../../interfaces/requests/teams.interface';
import { FetchedLeagueCatalog } from '../../interfaces/requests/leagues.interface';
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
import { ESourceCode } from '../../shared/enums';
import { uniqueBy } from '../../shared/array.utils';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    private readonly teamsRepository: TeamsRepository,
    private readonly teamLeaguesRepository: TeamLeaguesRepository,
  ) {}

  async upsertCatalogTeams(
    incomingTeams: FetchedLeagueCatalog['teams'],
    leaguesByExternalId: Map<number, LeaguesEntity>,
    sourceCode: ESourceCode,
    fallbackCountry?: string,
  ): Promise<Map<string, TeamEntity>> {
    const uniqueTeams = uniqueBy(incomingTeams, (team) => team.externalId);
    await this.teamsRepository.updateMany(uniqueTeams, undefined, sourceCode);
    if (fallbackCountry) {
      await this.teamsRepository.updateCountries(
        uniqueTeams.map((team) => ({
          externalId: team.externalId,
          country: team.country ?? fallbackCountry,
        })),
      );
    }
    const teamsByExternalId = new Map(
      (
        await this.teamsRepository.getWhere({
          source: { code: sourceCode },
        })
      ).map((team) => [team.externalId, team]),
    );

    await this.upsertLegaTeamLeagues(
      incomingTeams,
      teamsByExternalId,
      leaguesByExternalId,
    );

    return teamsByExternalId;
  }

  getBySource(sourceCode: ESourceCode): Promise<TeamEntity[]> {
    return this.teamsRepository.getWhere({ source: { code: sourceCode } });
  }

  private async upsertLegaTeamLeagues(
    incomingTeams: SynchronizeTeamsParams['teams'],
    teamsByExternalId: Map<string, TeamEntity>,
    leaguesByExternalId: Map<number, LeaguesEntity>,
  ): Promise<void> {
    const relations = uniqueBy(
      incomingTeams.flatMap((team) => {
        const storedTeam = teamsByExternalId.get(team.externalId);
        const league = leaguesByExternalId.get(team.leagueExternalId);

        return storedTeam && league ? [{ team: storedTeam, league }] : [];
      }),
      ({ team, league }) => `${team.id}:${league.id}`,
    );
    await this.teamLeaguesRepository.updateMany(relations);
  }

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
      ? await this.teamsRepository.getWhere({ externalId: In(externalIds) })
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
      ? await this.teamsRepository.getWhere({ externalId: In(externalIds) })
      : [];
    const existingRelations = await this.teamLeaguesRepository.getWhere({
      league: { id: In(leagues.map(({ id }) => id)) },
    });
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
      const championship = league?.stage.championship;

      if (team && league && championship) {
        sources.set(`${team.externalId}:${league.externalId}`, {
          team,
          league,
          championship,
        });
      }
    }

    return [...sources.values()];
  }
}
