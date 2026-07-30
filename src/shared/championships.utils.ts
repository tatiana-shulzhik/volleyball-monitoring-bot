import {
  CalculateChampionshipChangesParams,
  ChampionshipChanges,
} from '../interfaces/requests/championships.interface';
import { calculateEntityChanges } from './entity-changes.utils';

export function calculateChampionshipChanges(
  data: CalculateChampionshipChangesParams,
): ChampionshipChanges {
  const resolved = data.incoming.flatMap((championship) => {
    const season = data.seasonsByCycle.get(
      `${championship.competitionType}:${championship.yearStart}:${championship.yearEnd}`,
    );

    return season
      ? [
          {
            externalId: championship.externalId,
            name: championship.name,
            startsAt: championship.startsAt,
            endsAt: championship.endsAt,
            season,
          },
        ]
      : [];
  });

  return calculateEntityChanges({
    incoming: resolved,
    existing: data.existing,
    hasChanges: (stored, championship) =>
      stored.name !== championship.name ||
      stored.startsAt.getTime() !== championship.startsAt.getTime() ||
      stored.endsAt.getTime() !== championship.endsAt.getTime() ||
      stored.season.id !== championship.season.id,
  });
}
