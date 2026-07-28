import {
  IApplyRelationChangesParams,
  ICalculateRelationChangesParams,
  IRelationChanges,
} from '../interfaces/responses/relation-changes.interface';

export function calculateRelationChanges<
  TRelation extends { id: number },
  TIncoming,
>(
  data: ICalculateRelationChangesParams<TRelation, TIncoming>,
): IRelationChanges<TIncoming> {
  const { desired, existing, existingKey, hasChanges } = data;
  const existingByKey = new Map(
    existing.map((relation) => [existingKey(relation), relation]),
  );
  const missing = [...desired.entries()]
    .filter(([key]) => !existingByKey.has(key))
    .map(([, relation]) => relation);
  const changed = hasChanges
    ? [...desired.entries()]
        .filter(([key, relation]) => {
          const stored = existingByKey.get(key);
          return stored ? hasChanges(stored, relation) : false;
        })
        .map(([, relation]) => relation)
    : [];
  const obsoleteIds = existing
    .filter((relation) => !desired.has(existingKey(relation)))
    .map(({ id }) => id);

  return { missing, changed, obsoleteIds };
}

export async function applyRelationChanges<TIncoming>(
  data: IApplyRelationChangesParams<TIncoming>,
): Promise<void> {
  const { transactionOwner, repository, changes, allowDeletion } = data;

  await transactionOwner.useTransaction(undefined, async (manager) => {
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
