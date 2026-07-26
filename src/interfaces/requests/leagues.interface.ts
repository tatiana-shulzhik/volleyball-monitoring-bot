import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { EntityChanges } from '../responses/entity-changes.interface';

export interface ICevLeague {
  externalId: number;
  name: string;
  championshipExternalId: number;
}

export interface FetchedLeagues {
  leagues: ICevLeague[];
  isComplete: boolean;
}

export interface CalculateLeagueChangesParams {
  incoming: ICevLeague[];
  existing: LeaguesEntity[];
  championshipsByExternalId: Map<number, ChampionshipsEntity>;
}

export type LeagueChanges = EntityChanges<
  LeaguesEntity,
  Omit<LeaguesEntity, 'id'>
>;
