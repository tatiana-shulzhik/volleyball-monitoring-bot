import { ICevChampionship } from '../interfaces/requests/championships.interface';
import { ICevCompetitionStage } from '../interfaces/requests/competition-stages.interface';
import { ICevLeague } from '../interfaces/requests/leagues.interface';
import { ICevTeam } from '../interfaces/requests/teams.interface';
import {
  ILegaCatalog,
  ILegaCompetitionName,
  ILegaDateRange,
  ILegaOption,
} from '../interfaces/requests/lega-volley.interface';
import { CHAMPIONSHIP_RULES, STAGE_RULES } from './consts/constants';
import { ECompetitionType } from './enums';

export function parseLegaSeason(
  year: number,
  seasonName: string,
  html: string,
): ILegaCatalog & { year: number } {
  const championships = new Map<number, ICevChampionship>();
  const stages = new Map<string, ICevCompetitionStage>();
  const leagues: ICevLeague[] = [];
  const range = extractLegaDateRange(html);

  for (const option of readLegaOptions(html, 'campionato')) {
    const parsedName = parseCompetitionName(option.label);
    const competitionName = parsedName.championshipName;
    const stageName = parsedName.stageName;
    const championshipExternalId = hashLegaId(
      `legavolley:championship:${toLegaKey(competitionName)}`,
    );
    const stageExternalId = hashLegaId(
      `legavolley:stage:${year}:${toLegaKey(competitionName)}:${toLegaKey(stageName)}`,
    );

    championships.set(championshipExternalId, {
      externalId: championshipExternalId,
      name: competitionName,
      competitionType: ECompetitionType.Club,
    });

    const stageKey = `${championshipExternalId}:${stageExternalId}`;
    const existingStage = stages.get(stageKey);
    stages.set(stageKey, {
      externalId: stageExternalId,
      name: stageName,
      championshipExternalId,
      seasonName,
      startsAt: minLegaDate(existingStage?.startsAt, range.startsAt),
      endsAt: maxLegaDate(existingStage?.endsAt, range.endsAt),
    });

    leagues.push({
      externalId: Number(option.value),
      name: parsedName.leagueName,
      championshipExternalId,
      stageExternalId,
    });
  }

  return {
    year,
    championships: [...championships.values()],
    stages: [...stages.values()],
    leagues,
  };
}

export function parseCompetitionName(name: string): ILegaCompetitionName {
  const cleanName = name.trim();
  const championshipName = getChampionshipName(cleanName);
  const stageName = getStageName(cleanName);

  return {
    championshipName,
    stageName,
    leagueName: cleanName,
  };
}

export function readLegaOptions(
  html: string,
  selectName: string,
): ILegaOption[] {
  const select =
    html.match(
      new RegExp(
        `<select[^>]*(?:name|id)=["']${selectName}["'][^>]*>[\\s\\S]*?<\\/select>`,
        'i',
      ),
    )?.[0] ?? '';

  return [
    ...select.matchAll(
      /<option[^>]*value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi,
    ),
  ]
    .map(([, value, label]) => ({ value, label: cleanLegaText(label) }))
    .filter(({ label }) => label.length > 0);
}

export function normalizeLegaSeasonName(name: string): string {
  const match = name.match(/^(\d{4})\/(\d{2}|\d{4})$/);
  return match ? `${match[1]}/${match[2].slice(-2)}` : name;
}

export function readLegaTeams(
  html: string,
  leagueExternalId: number,
): ICevTeam[] {
  const select =
    html.match(/<select[^>]*id=["']sq["'][^>]*>[\s\S]*?<\/select>/i)?.[0] ?? '';

  return [
    ...select.matchAll(
      /<option[^>]*value=["'](\d+)["'][^>]*>([\s\S]*?)<\/option>/gi,
    ),
  ]
    .map(([, externalId, name]) => ({
      externalId,
      name: cleanLegaText(name),
      leagueExternalId,
    }))
    .filter(({ name }) => name.length > 0);
}

export function parseLegaTeamPage(
  html: string,
  fallbackName: string,
): { name: string; country: string } {
  const title = html.match(
    /<(?:h1|h2|title)[^>]*>([\s\S]*?)<\/(?:h1|h2|title)>/i,
  )?.[1];
  return {
    name: title ? cleanLegaText(title) : fallbackName,
    country: 'ITA',
  };
}

function getChampionshipName(name: string): string {
  return (
    CHAMPIONSHIP_RULES.find(({ pattern }) => pattern.test(name))?.name ?? name
  );
}

function getStageName(name: string): string {
  return (
    STAGE_RULES.find(({ pattern }) => pattern.test(name))?.name ?? 'Main Stage'
  );
}

function cleanLegaText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLegaDateRange(html: string): ILegaDateRange {
  const dates = [...html.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)].map(
    ([, day, month, year]) =>
      new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))),
  );
  if (!dates.length) return {};

  return {
    startsAt: new Date(Math.min(...dates.map((date) => date.getTime()))),
    endsAt: new Date(
      Math.max(...dates.map((date) => date.getTime() + 86_399_999)),
    ),
  };
}

function minLegaDate(first?: Date, second?: Date): Date | undefined {
  if (!first) return second;
  if (!second) return first;
  return first <= second ? first : second;
}

function maxLegaDate(first?: Date, second?: Date): Date | undefined {
  if (!first) return second;
  if (!second) return first;
  return first >= second ? first : second;
}

function hashLegaId(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return 1_000_000_000 + Math.abs(hash % 900_000_000);
}

function toLegaKey(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
