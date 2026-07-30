import {
  ICalculateStageChangesParams,
  StageChanges,
} from '../interfaces/requests/competition-stages.interface';
import { calculateEntityChanges } from './entity-changes.utils';

export function calculateStageChanges(
  data: ICalculateStageChangesParams,
): StageChanges {
  const existingByExternalId = new Map(
    data.existing.map((stage) => [stage.externalId, stage]),
  );
  const resolved = data.incoming.flatMap((stage) => {
    const championship = data.championshipsByExternalId.get(
      stage.championshipExternalId,
    );
    const season = stage.seasonName
      ? data.seasonsByName?.get(stage.seasonName)
      : undefined;
    const stored = existingByExternalId.get(stage.externalId);

    return championship
      ? [
          {
            externalId: stage.externalId,
            name: stage.name,
            championship,
            startsAt: stage.startsAt ?? stored?.startsAt ?? null,
            endsAt: stage.endsAt ?? stored?.endsAt ?? null,
            season: season ?? stored?.season ?? null,
          },
        ]
      : [];
  });

  return calculateEntityChanges({
    incoming: resolved,
    existing: data.existing,
    hasChanges: (stored, stage) =>
      stored.name !== stage.name ||
      stored.championship.id !== stage.championship.id ||
      (stage.startsAt !== null &&
        stored.startsAt?.getTime() !== stage.startsAt.getTime()) ||
      (stage.endsAt !== null &&
        stored.endsAt?.getTime() !== stage.endsAt.getTime()) ||
      (stage.season !== null && stored.season?.id !== stage.season.id),
  });
}
