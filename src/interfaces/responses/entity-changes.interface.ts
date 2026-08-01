import { Logger } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export interface EntityChanges<TEntity, TIncoming> {
  missing: TIncoming[];
  changed: TEntity[];
  obsoleteIds: number[];
}

export interface CalculateEntityChangesParams<TEntity, TIncoming, TKey> {
  incoming: TIncoming[];
  existing: TEntity[];
  keyOfExisting: (existing: TEntity) => TKey;
  keyOfIncoming: (incoming: TIncoming) => TKey;
  hasChanges: (existing: TEntity, incoming: TIncoming) => boolean;
}

export interface SyncRepository<TEntity, TIncoming> {
  useTransaction<T>(
    manager: EntityManager | undefined,
    fn: (manager: EntityManager) => Promise<T>,
  ): Promise<T>;
  insertMany(items: TIncoming[], manager?: EntityManager): Promise<unknown>;
  updateMany(items: TEntity[], manager?: EntityManager): Promise<unknown>;
  deleteMany(ids: number[], manager?: EntityManager): Promise<unknown>;
}

export interface ApplyEntityChangesParams<TEntity, TIncoming> {
  repository: SyncRepository<TEntity, TIncoming>;
  changes: EntityChanges<TEntity, TIncoming>;
  allowDeletion: boolean;
}

export interface LogEntityChangesParams<TEntity, TIncoming> {
  logger: Logger;
  entityName: string;
  changes: EntityChanges<TEntity, TIncoming>;
  isComplete: boolean;
  allowDeletion: boolean;
}
