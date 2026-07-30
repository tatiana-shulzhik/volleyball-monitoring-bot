import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { EntityChanges } from '../responses/entity-changes.interface';
import { ICevTeam } from './teams.interface';

export interface ICevLeague {
  externalId: number;
  name: string;
  stageExternalId: number;
}

export interface FetchedLeagueCatalog {
  leagues: ICevLeague[];
  teams: ICevTeam[];
  isComplete: boolean;
}

export interface CalculateLeagueChangesParams {
  incoming: ICevLeague[];
  existing: LeaguesEntity[];
  stagesByExternalId: Map<number, CompetitionStagesEntity>;
}

export type LeagueChanges = EntityChanges<
  LeaguesEntity,
  Omit<LeaguesEntity, 'id'>
>;
