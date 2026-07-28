import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { TeamLeagueEntity } from '../../databases/entities/team-league.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { EntityChanges } from '../responses/entity-changes.interface';
import { IRelationChanges } from '../responses/relation-changes.interface';

export interface ICevTeam {
  externalId: string;
  name: string;
  leagueExternalId: number;
}

export interface FetchedTeams {
  teams: ICevTeam[];
  isComplete: boolean;
}

export interface CalculateTeamChangesParams {
  incoming: ICevTeam[];
  existing: TeamEntity[];
}

export interface CalculateTeamLeagueChangesParams {
  incoming: ICevTeam[];
  existing: TeamLeagueEntity[];
  teamsByExternalId: Map<string, TeamEntity>;
  leaguesByExternalId: Map<number, LeaguesEntity>;
}

export interface SynchronizeTeamsParams {
  leagues: LeaguesEntity[];
  teams: ICevTeam[];
  isComplete: boolean;
}

export type TeamChanges = EntityChanges<TeamEntity, Omit<TeamEntity, 'id'>>;

export type TeamLeagueChanges = IRelationChanges<Omit<TeamLeagueEntity, 'id'>>;
