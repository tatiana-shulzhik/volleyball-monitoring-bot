import { ICevChampionship } from './championships.interface';
import { ICevCompetitionStage } from './competition-stages.interface';
import { ICevLeague } from './leagues.interface';

export interface ILegaCatalog {
  year: number;
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

export interface ILegaCompetitionName {
  championshipName: string;
  stageName: string;
  leagueName: string;
}

export interface ILegaPlayer {
  externalId: string;
  fullName: string;
  shirtNumber: number | null;
  position: string | null;
  birthYear: number | null;
  teamExternalId: string;
  leagueExternalId: number;
}

export interface ILegaCompetitionRule {
  pattern: RegExp;
  name: string;
}

export interface ILegaStageRule {
  pattern: RegExp;
  name: string;
}

export interface IMapSettledParams<TInput, TOutput> {
  items: TInput[];
  mapper: (item: TInput) => Promise<TOutput>;
  concurrency: number;
}
