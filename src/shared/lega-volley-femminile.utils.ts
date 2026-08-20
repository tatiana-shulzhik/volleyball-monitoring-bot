import { ICevChampionship } from '../interfaces/requests/championships.interface';
import { ICevCompetitionStage } from '../interfaces/requests/competition-stages.interface';
import { ICevLeague } from '../interfaces/requests/leagues.interface';
import { ICevMatch } from '../interfaces/requests/matches.interface';
import { ICevTeam } from '../interfaces/requests/teams.interface';
import {
  ILegaVolleyFemminileCompetition,
  ILegaVolleyFemminileSeason,
} from '../interfaces/requests/lega-volley-femminile.interface';
import { ECompetitionType, EMatchStatus } from './enums';
import { parseSeasonEndYear } from './season.utils';

export function readLegaVolleyFemminileSeasons(
  html: string,
  earliestYear: number,
): ILegaVolleyFemminileSeason[] {
  const seasons = new Map<number, ILegaVolleyFemminileSeason>();

  for (const link of readLinks(html)) {
    const url = parseUrl(link.href);
    const year = Number(url.searchParams.get('stagione'));
    if (
      !Number.isInteger(year) ||
      url.searchParams.has('campionato') ||
      url.searchParams.has('club')
    ) {
      continue;
    }
    const name = normalizeSeasonName(cleanText(link.label));
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
  competitions: ILegaVolleyFemminileCompetition[];
} {
  const championships = new Map<number, ICevChampionship>();
  const stages = new Map<string, ICevCompetitionStage>();
  const leagues: ICevLeague[] = [];
  const competitions: ILegaVolleyFemminileCompetition[] = [];

  for (const { season, html } of pages) {
    for (const competition of readCompetitions(html, season)) {
      competitions.push(competition);
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
    competitions,
  };
}

export function readLegaVolleyFemminileMatches(
  html: string,
  leagueExternalId: number,
): { teams: ICevTeam[]; matches: ICevMatch[] } {
  const teams = new Map<string, ICevTeam>();
  const matches = new Map<string, ICevMatch>();

  for (const tableMatch of html.matchAll(
    /<table\b[^>]*class=["'][^"']*\brisultati\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi,
  )) {
    const table = tableMatch[1];
    const sourceMatchId = table.match(/\/match-center\/(\d+)/i)?.[1];
    const teamLinks = [
      ...table.matchAll(
        /<a\b[^>]*href=["'][^"']*\/club\/[^/"']+\/(\d+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi,
      ),
    ];
    if (!sourceMatchId || teamLinks.length < 2) continue;

    const homeTeamExternalId = teamLinks[0][1];
    const awayTeamExternalId = teamLinks[1][1];
    const homeTeamName = cleanText(teamLinks[0][2]);
    const awayTeamName = cleanText(teamLinks[1][2]);
    if (!homeTeamName || !awayTeamName) continue;

    teams.set(homeTeamExternalId, {
      externalId: homeTeamExternalId,
      name: homeTeamName,
      leagueExternalId,
      country: 'ITA',
    });
    teams.set(awayTeamExternalId, {
      externalId: awayTeamExternalId,
      name: awayTeamName,
      leagueExternalId,
      country: 'ITA',
    });

    const scores = [
      ...table.matchAll(
        /<th\b[^>]*class=["'][^"']*\bnum\b[^"']*["'][^>]*>([\s\S]*?)<\/th>/gi,
      ),
    ].map((match) => cleanText(match[1]));
    const status = /annullat|cancel/i.test(cleanText(table))
      ? EMatchStatus.Cancelled
      : scores.length >= 2 &&
          scores.slice(0, 2).every((score) => /^\d+$/.test(score))
        ? EMatchStatus.Finished
        : EMatchStatus.Scheduled;
    const externalId = `legavolley_femminile:${sourceMatchId}`;
    matches.set(externalId, {
      externalId,
      leagueExternalId,
      homeTeamExternalId,
      awayTeamExternalId,
      scheduledAt: readMatchDate(table),
      status,
    });
  }

  return { teams: [...teams.values()], matches: [...matches.values()] };
}

function readCompetitions(
  html: string,
  season: ILegaVolleyFemminileSeason,
): ILegaVolleyFemminileCompetition[] {
  const competitions = new Map<number, ILegaVolleyFemminileCompetition>();
  for (const link of readLinks(html)) {
    const url = parseUrl(link.href);
    const externalId = Number(url.searchParams.get('campionato'));
    const year = Number(url.searchParams.get('stagione'));
    if (
      !Number.isInteger(externalId) ||
      externalId <= 0 ||
      year !== season.year ||
      url.searchParams.has('club') ||
      url.searchParams.has('giornata')
    ) {
      continue;
    }
    const name = cleanText(link.label);
    if (name) {
      competitions.set(externalId, {
        externalId,
        name,
        seasonYear: season.year,
        seasonName: season.name,
      });
    }
  }

  return [...competitions.values()];
}

function readMatchDate(html: string): Date | null {
  const date = html.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  if (!date) return null;
  const time = html.match(/\b(\d{1,2}):(\d{2})\b/);

  return new Date(
    Date.UTC(
      Number(date[3]),
      Number(date[2]) - 1,
      Number(date[1]),
      Number(time?.[1] ?? 0),
      Number(time?.[2] ?? 0),
    ),
  );
}

function readLinks(html: string): Array<{ href: string; label: string }> {
  return [
    ...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  ].map(([, href, label]) => ({ href, label }));
}

function parseUrl(value: string): URL {
  return new URL(
    value.replace(/&amp;/gi, '&'),
    'https://www.legavolleyfemminile.it',
  );
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
