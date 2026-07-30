import {
  ICalculateChampionshipChangesParams,
  ChampionshipChanges,
} from '../interfaces/requests/championships.interface';
import { calculateEntityChanges } from './entity-changes.utils';

export function calculateChampionshipChanges(
  data: ICalculateChampionshipChangesParams,
): ChampionshipChanges {
  return calculateEntityChanges({
    incoming: data.incoming,
    existing: data.existing,
    hasChanges: (stored, championship) =>
      stored.name !== championship.name ||
      stored.competitionType !== championship.competitionType,
  });
}
