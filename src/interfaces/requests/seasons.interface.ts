import { ICevChampionship } from './championships.interface';
import { ICevCompetitionStage } from './competition-stages.interface';
import { ECompetitionType, ESourceCode } from '../../shared/enums';

export interface ISeason {
  name: string;
}

export interface IFetchedSeasonCatalog {
  championships: ICevChampionship[];
  stages: ICevCompetitionStage[];
  isComplete: boolean;
}

export interface IFindRecentSeasonsFromParams {
  seasonId: number;
  competitionType: ECompetitionType;
  sourceCode: ESourceCode;
}
