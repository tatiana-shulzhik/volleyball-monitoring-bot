import { SeasonsEntity } from '../databases/entities/seasons.entity';
import { ICevSeason } from '../interfaces/requests/seasons.interface';
import { PREVIOUS_YEARS_COUNT } from './consts/constants';
import {
  RelevantSeason,
  SeasonsChanges,
} from '../interfaces/requests/seasons.interface';
import { calculateEntityChanges } from './entity-changes.utils';

export function selectRelevantSeasons(
  seasons: ICevSeason[],
  currentYear = new Date().getFullYear(),
): RelevantSeason[] {
  const earliestRelevantYear = currentYear - PREVIOUS_YEARS_COUNT;

  return seasons.filter((season) => season.yearEnd >= earliestRelevantYear);
}

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
    existing.yearStart !== incoming.yearStart ||
    existing.yearEnd !== incoming.yearEnd ||
    existing.startsAt?.getTime() !== incoming.startsAt.getTime() ||
    existing.endsAt?.getTime() !== incoming.endsAt.getTime()
  );
}
