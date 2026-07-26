import {
  ApplyEntityChangesParams,
  LogEntityChangesParams,
} from '../interfaces/responses/entity-changes.interface';

export async function applyEntityChanges<TEntity, TIncoming>(
  data: ApplyEntityChangesParams<TEntity, TIncoming>,
): Promise<void> {
  const { repository, changes, allowDeletion } = data;

  await repository.useTransaction(undefined, async (manager) => {
    if (changes.missing.length) {
      await repository.insertMany(changes.missing, manager);
    }
    if (changes.changed.length) {
      await repository.updateMany(changes.changed, manager);
    }
    if (allowDeletion && changes.obsoleteIds.length) {
      await repository.deleteMany(changes.obsoleteIds, manager);
    }
  });
}

export function logEntityChanges<TEntity, TIncoming>(
  data: LogEntityChangesParams<TEntity, TIncoming>,
): void {
  const { logger, entityName, changes, isComplete, allowDeletion } = data;

  if (!isComplete) {
    logger.warn(`Some CEV requests failed; ${entityName} sync is incomplete`);
  }

  logger.log(
    `${entityName} synchronized: ${changes.missing.length} inserted, ` +
      `${changes.changed.length} updated, ` +
      `${isComplete && allowDeletion ? changes.obsoleteIds.length : 0} deleted`,
  );
}
