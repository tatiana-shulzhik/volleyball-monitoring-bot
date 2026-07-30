import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { EntityChanges } from '../responses/entity-changes.interface';

export interface ICevCompetitionStage {
  externalId: number;
  name: string;
  championshipExternalId: number;
  startsAt?: Date;
  endsAt?: Date;
  seasonName?: string;
}

export interface FetchedCompetitionStages {
  stages: ICevCompetitionStage[];
  isComplete: boolean;
}

export interface ICalculateStageChangesParams {
  incoming: ICevCompetitionStage[];
  existing: CompetitionStagesEntity[];
  championshipsByExternalId: Map<number, ChampionshipsEntity>;
  seasonsByName?: Map<string, SeasonsEntity>;
}

export type StageChanges = EntityChanges<
  CompetitionStagesEntity,
  Omit<CompetitionStagesEntity, 'id'>
>;
