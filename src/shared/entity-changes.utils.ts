import {
  CalculateEntityChangesParams,
  EntityChanges,
} from '../interfaces/responses/entity-changes.interface';

export function calculateEntityChanges<
  TEntity extends { id: number; externalId: string | number },
  TIncoming extends { externalId: string | number },
>(
  data: CalculateEntityChangesParams<TEntity, TIncoming>,
): EntityChanges<TEntity, TIncoming> {
  const { incoming, existing, hasChanges } = data;
  const incomingIds = new Set(incoming.map(({ externalId }) => externalId));
  const existingByExternalId = new Map(
    existing.map((entity) => [entity.externalId, entity]),
  );
  const missing: TIncoming[] = [];
  const changed: TEntity[] = [];

  for (const item of incoming) {
    const stored = existingByExternalId.get(item.externalId);

    if (!stored) {
      missing.push(item);
    } else if (hasChanges(stored, item)) {
      changed.push({ ...stored, ...item });
    }
  }

  const obsoleteIds = existing
    .filter(({ externalId }) => !incomingIds.has(externalId))
    .map(({ id }) => id);

  return { missing, changed, obsoleteIds };
}
