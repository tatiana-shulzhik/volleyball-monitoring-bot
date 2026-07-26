import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { EntityChanges } from '../responses/entity-changes.interface';

export interface ICevChampionship {
  externalId: number;
  name: string;
  seasonExternalId: number;
}

export interface FetchedChampionships {
  championships: ICevChampionship[];
  isComplete: boolean;
}

export interface CalculateChampionshipChangesParams {
  incoming: ICevChampionship[];
  existing: ChampionshipsEntity[];
  seasonsByExternalId: Map<number, SeasonsEntity>;
}

export type ChampionshipChanges = EntityChanges<
  ChampionshipsEntity,
  Omit<ChampionshipsEntity, 'id'>
>;
