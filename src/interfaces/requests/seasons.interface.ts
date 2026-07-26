import { SeasonsEntity } from '../../databases/entities/seasons.entity';

export type RelevantSeason = ICevSeason & Pick<SeasonsEntity, 'isCurrent'>;

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
}
