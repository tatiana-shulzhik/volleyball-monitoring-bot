import {
  CalculateStageChangesParams,
  StageChanges,
} from '../interfaces/requests/competition-stages.interface';
import { calculateEntityChanges } from './entity-changes.utils';

export function calculateStageChanges(
  data: CalculateStageChangesParams,
): StageChanges {
  const resolved = data.incoming.flatMap((stage) => {
    const championship = data.championshipsByExternalId.get(
      stage.championshipExternalId,
    );

    return championship
      ? [{ externalId: stage.externalId, name: stage.name, championship }]
      : [];
  });

  return calculateEntityChanges({
    incoming: resolved,
    existing: data.existing,
    hasChanges: (stored, stage) =>
      stored.name !== stage.name ||
      stored.championship.id !== stage.championship.id,
  });
}
