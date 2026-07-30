import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { ECompetitionType } from '../../shared/enums';
import { EntityChanges } from '../responses/entity-changes.interface';

export interface ICevChampionship {
  externalId: number;
  name: string;
  competitionType: ECompetitionType;
}

export interface ICalculateChampionshipChangesParams {
  incoming: ICevChampionship[];
  existing: ChampionshipsEntity[];
}

export type ChampionshipChanges = EntityChanges<
  ChampionshipsEntity,
  Omit<ChampionshipsEntity, 'id' | 'stages'>
>;
