import { ICevChampionship } from '../interfaces/requests/championships.interface';
import { ICevCompetitionStage } from '../interfaces/requests/competition-stages.interface';
import { ICevLeague } from '../interfaces/requests/leagues.interface';
import {
  ILegaVolleyFemminileCompetition,
  ILegaVolleyFemminileSeason,
} from '../interfaces/requests/lega-volley-femminile.interface';
import { ECompetitionType } from './enums';
import { parseSeasonEndYear } from './season.utils';

export function readLegaVolleyFemminileSeasons(
  html: string,
  earliestYear: number,
): ILegaVolleyFemminileSeason[] {
  const seasons = new Map<number, ILegaVolleyFemminileSeason>();

  for (const match of html.matchAll(
    /href=["'][^"']*\/classifica\/\?stagione=(\d{4})["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const year = Number(match[1]);
    const name = normalizeSeasonName(cleanText(match[2]));
    if ((parseSeasonEndYear(name) ?? 0) >= earliestYear) {
      seasons.set(year, { year, name });
    }
  }

  return [...seasons.values()];
}

export function parseLegaVolleyFemminileCatalog(
  pages: Array<{ season: ILegaVolleyFemminileSeason; html: string }>,
): {
  championships: ICevChampionship[];
  stages: ICevCompetitionStage[];
  leagues: ICevLeague[];
} {
  const championships = new Map<number, ICevChampionship>();
  const stages = new Map<string, ICevCompetitionStage>();
  const leagues: ICevLeague[] = [];

  for (const { season, html } of pages) {
    for (const competition of readCompetitions(html, season)) {
      const championshipExternalId = hashId(
        `championship:${competition.externalId}`,
      );
      const stageExternalId = hashId(`stage:${competition.externalId}`);
      const stageKey = `${championshipExternalId}:${stageExternalId}`;
      championships.set(championshipExternalId, {
        externalId: championshipExternalId,
        name: `${competition.name} ${competition.seasonName}`,
        competitionType: ECompetitionType.Club,
      });
      stages.set(stageKey, {
        externalId: stageExternalId,
        name: competition.name,
        championshipExternalId,
        seasonName: competition.seasonName,
      });
      leagues.push({
        externalId: competition.externalId,
        name: competition.name,
        championshipExternalId,
        stageExternalId,
      });
    }
  }

  return {
    championships: [...championships.values()],
    stages: [...stages.values()],
    leagues,
  };
}

function readCompetitions(
  html: string,
  season: ILegaVolleyFemminileSeason,
): ILegaVolleyFemminileCompetition[] {
  const competitions = new Map<number, ILegaVolleyFemminileCompetition>();
  const regex = new RegExp(
    `href=["'][^"']*\\/classifica\\/\\?campionato=(\\d+)(?:&amp;|&)stagione=${season.year}["'][^>]*>([\\s\\S]*?)<\\/a>`,
    'gi',
  );

  for (const match of html.matchAll(regex)) {
    const externalId = Number(match[1]);
    const name = cleanText(match[2]);
    if (name) {
      competitions.set(externalId, {
        externalId,
        name,
        seasonName: season.name,
      });
    }
  }

  return [...competitions.values()];
}

function normalizeSeasonName(value: string): string {
  const match = value.match(/^(\d{4})\/(\d{2}|\d{4})$/);
  return match ? `${match[1]}/${match[2].slice(-2)}` : value;
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashId(value: string): number {
  let hash = 0;
  const key = `legavolley_femminile:${value}`;
  for (let index = 0; index < key.length; index++) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return 1_000_000_000 + Math.abs(hash % 900_000_000);
}
