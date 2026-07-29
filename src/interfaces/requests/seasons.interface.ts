import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { ECompetitionType } from '../../shared/enums';

export type RelevantSeason = ICevSeason;

export interface SeasonsChanges {
  missing: RelevantSeason[];
  changed: SeasonsEntity[];
  obsoleteIds: number[];
}

export interface FetchedSeasons {
  seasons: ICevSeason[];
  isComplete: boolean;
}

export interface ICevSeason {
  name: string;
  yearStart: number;
  yearEnd: number;
  externalId: number;
  competitionType: ECompetitionType;
  startsAt: Date;
  endsAt: Date;
}
