import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { ECompetitionType } from '../../shared/enums';
import { EntityChanges } from '../responses/entity-changes.interface';

export interface ICevChampionship {
  externalId: number;
  name: string;
  startsAt: Date;
  endsAt: Date;
  seasonName: string;
  competitionType: ECompetitionType;
}

export interface CalculateChampionshipChangesParams {
  incoming: ICevChampionship[];
  existing: ChampionshipsEntity[];
  seasonsByName: Map<string, SeasonsEntity>;
}

export type ChampionshipChanges = EntityChanges<
  ChampionshipsEntity,
  Omit<ChampionshipsEntity, 'id' | 'stages'>
>;
