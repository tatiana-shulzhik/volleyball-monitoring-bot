import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { EntityChanges } from '../responses/entity-changes.interface';

export interface ICevCompetitionStage {
  externalId: number;
  name: string;
  championshipExternalId: number;
}

export interface FetchedCompetitionStages {
  stages: ICevCompetitionStage[];
  isComplete: boolean;
}

export interface CalculateStageChangesParams {
  incoming: ICevCompetitionStage[];
  existing: CompetitionStagesEntity[];
  championshipsByExternalId: Map<number, ChampionshipsEntity>;
}

export type StageChanges = EntityChanges<
  CompetitionStagesEntity,
  Omit<CompetitionStagesEntity, 'id'>
>;
