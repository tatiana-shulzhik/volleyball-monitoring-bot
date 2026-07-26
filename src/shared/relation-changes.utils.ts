import {
  ApplyRelationChangesParams,
  CalculateRelationChangesParams,
  RelationChanges,
} from '../interfaces/responses/relation-changes.interface';

export function calculateRelationChanges<
  TRelation extends { id: number },
  TIncoming,
>(
  data: CalculateRelationChangesParams<TRelation, TIncoming>,
): RelationChanges<TIncoming> {
  const { desired, existing, existingKey } = data;
  const existingKeys = new Set(existing.map(existingKey));
  const missing = [...desired.entries()]
    .filter(([key]) => !existingKeys.has(key))
    .map(([, relation]) => relation);
  const obsoleteIds = existing
    .filter((relation) => !desired.has(existingKey(relation)))
    .map(({ id }) => id);

  return { missing, obsoleteIds };
}

export async function applyRelationChanges<TIncoming>(
  data: ApplyRelationChangesParams<TIncoming>,
): Promise<void> {
  const { transactionOwner, repository, changes, allowDeletion } = data;

  await transactionOwner.useTransaction(undefined, async (manager) => {
    if (changes.missing.length) {
      await repository.insertMany(changes.missing, manager);
    }
    if (allowDeletion && changes.obsoleteIds.length) {
      await repository.deleteMany(changes.obsoleteIds, manager);
    }
  });
}
