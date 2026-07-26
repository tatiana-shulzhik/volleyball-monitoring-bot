import { EntityManager } from 'typeorm';
import { SyncRepository } from './entity-changes.interface';

export interface RelationChanges<TIncoming> {
  missing: TIncoming[];
  obsoleteIds: number[];
}

export interface CalculateRelationChangesParams<TRelation, TIncoming> {
  desired: Map<string, TIncoming>;
  existing: TRelation[];
  existingKey: (relation: TRelation) => string;
}

export interface RelationRepository<TIncoming> {
  insertMany(items: TIncoming[], manager?: EntityManager): Promise<unknown>;
  deleteMany(ids: number[], manager?: EntityManager): Promise<unknown>;
}

export interface ApplyRelationChangesParams<TIncoming> {
  transactionOwner: Pick<SyncRepository<unknown, unknown>, 'useTransaction'>;
  repository: RelationRepository<TIncoming>;
  changes: RelationChanges<TIncoming>;
  allowDeletion: boolean;
}
