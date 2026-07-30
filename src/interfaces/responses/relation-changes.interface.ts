import { EntityManager } from 'typeorm';
import { SyncRepository } from './entity-changes.interface';

export interface IRelationChanges<TIncoming> {
  missing: TIncoming[];
  changed: TIncoming[];
  obsoleteIds: number[];
}

export interface ICalculateRelationChangesParams<TRelation, TIncoming> {
  desired: Map<string, TIncoming>;
  existing: TRelation[];
  existingKey: (relation: TRelation) => string;
  hasChanges?: (existing: TRelation, incoming: TIncoming) => boolean;
}

export interface IRelationRepository<TIncoming> {
  insertMany(items: TIncoming[], manager?: EntityManager): Promise<unknown>;
  updateMany(items: TIncoming[], manager?: EntityManager): Promise<unknown>;
  deleteMany(ids: number[], manager?: EntityManager): Promise<unknown>;
}

export interface IApplyRelationChangesParams<TIncoming> {
  transactionOwner: Pick<SyncRepository<unknown, unknown>, 'useTransaction'>;
  repository: IRelationRepository<TIncoming>;
  changes: IRelationChanges<TIncoming>;
  allowDeletion: boolean;
}
