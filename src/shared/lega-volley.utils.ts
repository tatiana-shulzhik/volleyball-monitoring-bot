import { ICevChampionship } from '../interfaces/requests/championships.interface';
import { ICevCompetitionStage } from '../interfaces/requests/competition-stages.interface';
import { ICevLeague } from '../interfaces/requests/leagues.interface';
import {
  ILegaCatalog,
  ILegaDateRange,
  ILegaOption,
} from '../interfaces/requests/lega-volley.interface';
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
    const competitionName = getLegaCompetitionName(option.label);
    const stageName = getLegaStageName(option.label);
    const championshipExternalId = hashLegaId(
      `legavolley:championship:${competitionName}`,
    );
    const stageExternalId = hashLegaId(
      `legavolley:stage:${year}:${competitionName}:${stageName}`,
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
      name: option.label,
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

export function readLegaOptions(
  html: string,
  selectName: string,
): ILegaOption[] {
  const select =
    html.match(
      new RegExp(
        `<select[^>]*name=["']${selectName}["'][^>]*>[\\s\\S]*?<\\/select>`,
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

function getLegaCompetitionName(name: string): string {
  if (/SuperLega/i.test(name)) return 'SuperLega';
  if (/Serie A2/i.test(name)) return 'Serie A2';
  if (/Serie A3/i.test(name)) return 'Serie A3';
  return name
    .replace(/^(Regular Season|Play Off|Coppa Italia|Supercoppa)\s*/i, '')
    .trim();
}

function getLegaStageName(name: string): string {
  if (/^Regular Season/i.test(name)) return 'Regular Season';
  if (/^Play Off/i.test(name)) return 'Play Off';
  if (/^Coppa Italia/i.test(name)) return 'Coppa Italia';
  if (/^Supercoppa/i.test(name)) return 'Supercoppa';
  return 'Main stage';
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
