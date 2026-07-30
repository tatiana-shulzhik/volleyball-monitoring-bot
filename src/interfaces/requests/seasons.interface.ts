import { ICevChampionship } from './championships.interface';
import { ICevCompetitionStage } from './competition-stages.interface';

export interface ISeason {
  name: string;
}

export interface IFetchedSeasonCatalog {
  championships: ICevChampionship[];
  stages: ICevCompetitionStage[];
  isComplete: boolean;
}
