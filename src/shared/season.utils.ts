import { ECompetitionType } from './enums';

const SEASON_START_MONTH = 6;

export function getSeasonStartYear(date: Date): number {
  const year = date.getUTCFullYear();

  return date.getUTCMonth() >= SEASON_START_MONTH ? year : year - 1;
}

export function getSeasonName(date: Date): string {
  const startYear = getSeasonStartYear(date);

  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

export function getCompetitionSeasonName(
  competitionType: ECompetitionType,
  calendarYear: number,
): string {
  if (competitionType === ECompetitionType.NationalTeam) {
    return String(calendarYear);
  }

  return `${calendarYear - 1}/${String(calendarYear).slice(-2)}`;
}

export function parseSeasonStartYear(name?: string): number | undefined {
  if (!name) {
    return undefined;
  }

  const match = name.match(/^(\d{4})(?:\/(\d{2}|\d{4}))?$/);

  return match ? Number(match[1]) : undefined;
}

export function parseSeasonEndYear(name?: string): number | undefined {
  const startYear = parseSeasonStartYear(name);

  if (startYear === undefined) {
    return undefined;
  }

  return name?.includes('/') ? startYear + 1 : startYear;
}
