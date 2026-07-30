import { ICevChampionship } from './championships.interface';

export interface ISeason {
  name: string;
}

export interface FetchedSeasonCatalog {
  championships: ICevChampionship[];
  isComplete: boolean;
}
