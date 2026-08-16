import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { EntityChanges } from '../responses/entity-changes.interface';
import { ICevTeam } from './teams.interface';
import { ILegaPlayer } from './lega-volley.interface';

export interface ICevLeague {
  externalId: number;
  name: string;
  championshipExternalId: number;
  stageExternalId: number;
}

export interface FetchedLeagueCatalog {
  leagues: ICevLeague[];
  teams: ICevTeam[];
  players?: ILegaPlayer[];
  isComplete: boolean;
}

export interface CalculateLeagueChangesParams {
  incoming: ICevLeague[];
  existing: LeaguesEntity[];
  stagesByKey: Map<string, CompetitionStagesEntity>;
}

export type LeagueChanges = EntityChanges<
  LeaguesEntity,
  Omit<LeaguesEntity, 'id'>
>;
