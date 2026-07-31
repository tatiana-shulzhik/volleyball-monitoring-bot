import {
  CalculateEntityChangesParams,
  EntityChanges,
} from '../interfaces/responses/entity-changes.interface';

export function calculateEntityChanges<
  TEntity extends { id: number },
  TIncoming,
  TKey,
>(
  data: CalculateEntityChangesParams<TEntity, TIncoming, TKey>,
): EntityChanges<TEntity, TIncoming> {
  const { incoming, existing, keyOfExisting, keyOfIncoming, hasChanges } = data;
  const incomingKeys = new Set(incoming.map(keyOfIncoming));
  const existingByKey = new Map(
    existing.map((entity) => [keyOfExisting(entity), entity]),
  );
  const missing: TIncoming[] = [];
  const changed: TEntity[] = [];

  for (const item of incoming) {
    const stored = existingByKey.get(keyOfIncoming(item));

    if (!stored) {
      missing.push(item);
    } else if (hasChanges(stored, item)) {
      changed.push({ ...stored, ...item });
    }
  }

  const obsoleteIds = existing
    .filter((entity) => !incomingKeys.has(keyOfExisting(entity)))
    .map(({ id }) => id);

  return { missing, changed, obsoleteIds };
}
