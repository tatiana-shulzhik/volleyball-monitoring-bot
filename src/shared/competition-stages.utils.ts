import {
  ICalculateStageChangesParams,
  StageChanges,
} from '../interfaces/requests/competition-stages.interface';
import { calculateEntityChanges } from './entity-changes.utils';

export function calculateStageChanges(
  data: ICalculateStageChangesParams,
): StageChanges {
  const existingByKey = new Map(
    data.existing.map((stage) => [
      createCompetitionStageKey(
        stage.championship.externalId,
        stage.externalId,
      ),
      stage,
    ]),
  );
  const resolved = data.incoming.flatMap((stage) => {
    const championship = data.championshipsByExternalId.get(
      stage.championshipExternalId,
    );
    const season = stage.seasonName
      ? data.seasonsByName?.get(stage.seasonName)
      : undefined;
    const stored = existingByKey.get(
      createCompetitionStageKey(stage.championshipExternalId, stage.externalId),
    );

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
    keyOfExisting: (stage) =>
      createCompetitionStageKey(
        stage.championship.externalId,
        stage.externalId,
      ),
    keyOfIncoming: (stage) =>
      createCompetitionStageKey(
        stage.championship.externalId,
        stage.externalId,
      ),
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

export function createCompetitionStageKey(
  championshipExternalId: number,
  stageExternalId: number,
): string {
  return `${championshipExternalId}:${stageExternalId}`;
}
