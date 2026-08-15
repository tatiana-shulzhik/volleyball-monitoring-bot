import { ICevChampionship } from './championships.interface';
import { ICevCompetitionStage } from './competition-stages.interface';
import { ICevLeague } from './leagues.interface';

export interface ILegaCatalog {
  championships: ICevChampionship[];
  stages: ICevCompetitionStage[];
  leagues: ICevLeague[];
}

export interface ILegaOption {
  value: string;
  label: string;
}

export interface ILegaDateRange {
  startsAt?: Date;
  endsAt?: Date;
}
