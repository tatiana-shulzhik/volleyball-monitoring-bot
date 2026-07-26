import {
  CalculateChampionshipChangesParams,
  ChampionshipChanges,
} from '../interfaces/requests/championships.interface';
import { calculateEntityChanges } from './entity-changes.utils';

export function calculateChampionshipChanges(
  data: CalculateChampionshipChangesParams,
): ChampionshipChanges {
  const { incoming, existing, seasonsByExternalId } = data;
  const resolved = incoming.flatMap((championship) => {
    const season = seasonsByExternalId.get(championship.seasonExternalId);

    return season
      ? [
          {
            externalId: championship.externalId,
            name: championship.name,
            season,
          },
        ]
      : [];
  });

  return calculateEntityChanges({
    incoming: resolved,
    existing,
    hasChanges: (stored, championship) =>
      stored.name !== championship.name ||
      stored.season.id !== championship.season.id,
  });
}
