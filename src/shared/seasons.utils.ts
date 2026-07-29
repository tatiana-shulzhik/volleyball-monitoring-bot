import { SeasonsEntity } from '../databases/entities/seasons.entity';
import {
  RelevantSeason,
  SeasonsChanges,
} from '../interfaces/requests/seasons.interface';
import { calculateEntityChanges } from './entity-changes.utils';

export function calculateSeasonsChanges(
  incoming: RelevantSeason[],
  existing: SeasonsEntity[],
): SeasonsChanges {
  return calculateEntityChanges({
    incoming,
    existing,
    hasChanges: hasSeasonChanges,
  });
}

function hasSeasonChanges(
  existing: SeasonsEntity,
  incoming: RelevantSeason,
): boolean {
  return (
    existing.name !== incoming.name ||
    existing.competitionType !== incoming.competitionType ||
    existing.yearStart !== incoming.yearStart ||
    existing.yearEnd !== incoming.yearEnd ||
    existing.startsAt?.getTime() !== incoming.startsAt.getTime() ||
    existing.endsAt?.getTime() !== incoming.endsAt.getTime()
  );
}
