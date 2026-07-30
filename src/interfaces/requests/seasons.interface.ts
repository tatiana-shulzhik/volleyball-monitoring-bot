import { ECompetitionType } from '../../shared/enums';
import { ICevChampionship } from './championships.interface';

export interface ICevSeason {
  name: string;
  yearStart: number;
  yearEnd: number;
  competitionType: ECompetitionType;
}

export interface FetchedSeasonCatalog {
  championships: ICevChampionship[];
  isComplete: boolean;
}
