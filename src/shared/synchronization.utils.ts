import {
  ApplyEntityChangesParams,
  LogEntityChangesParams,
} from '../interfaces/responses/entity-changes.interface';
import { splitIntoBatches } from './array.utils';

const ENTITY_CHANGES_BATCH_SIZE = 500;

export async function applyEntityChanges<TEntity, TIncoming>(
  data: ApplyEntityChangesParams<TEntity, TIncoming>,
): Promise<void> {
  const { repository, changes, allowDeletion } = data;
  const hasChanges =
    changes.missing.length > 0 ||
    changes.changed.length > 0 ||
    (allowDeletion && changes.obsoleteIds.length > 0);

  if (!hasChanges) {
    return;
  }

  await repository.useTransaction(undefined, async (manager) => {
    if (changes.missing.length) {
      for (const batch of splitIntoBatches(
        changes.missing,
        ENTITY_CHANGES_BATCH_SIZE,
      )) {
        await repository.insertMany(batch, manager);
      }
    }
    if (changes.changed.length) {
      for (const batch of splitIntoBatches(
        changes.changed,
        ENTITY_CHANGES_BATCH_SIZE,
      )) {
        await repository.updateMany(batch, manager);
      }
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
