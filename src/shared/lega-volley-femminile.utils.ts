import { ICevChampionship } from '../interfaces/requests/championships.interface';
import { ICevCompetitionStage } from '../interfaces/requests/competition-stages.interface';
import { ICevLeague } from '../interfaces/requests/leagues.interface';
import { ICevMatch } from '../interfaces/requests/matches.interface';
import { ICevTeam } from '../interfaces/requests/teams.interface';
import {
  ILegaVolleyFemminileCompetition,
  ILegaVolleyFemminilePlayer,
  ILegaVolleyFemminileMatchStatistics,
  ILegaVolleyFemminilePlayerStatistic,
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
      const hierarchy = getCompetitionHierarchy(competition.name);
      const championshipExternalId = hashId(
        `championship:${hierarchy.championshipName}`,
      );
      const stageExternalId = hashId(
        `stage:${competition.seasonYear}:${hierarchy.stageName}`,
      );
      const stageKey = `${championshipExternalId}:${stageExternalId}`;
      championships.set(championshipExternalId, {
        externalId: championshipExternalId,
        name: hierarchy.championshipName,
        competitionType: ECompetitionType.Club,
      });
      stages.set(stageKey, {
        externalId: stageExternalId,
        name: hierarchy.stageName,
        championshipExternalId,
        seasonName: competition.seasonName,
      });
      leagues.push({
        externalId: competition.externalId,
        name: hierarchy.leagueName,
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
          scores.slice(0, 2).every((score) => /^\d+$/.test(score)) &&
          scores.slice(0, 2).some((score) => score !== '0')
        ? EMatchStatus.Finished
        : EMatchStatus.Scheduled;
    const externalId = sourceMatchId;
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

export function readLegaVolleyFemminileCalendarTeams(
  html: string,
  leagueExternalId: number,
): ICevTeam[] {
  const clubs = html.match(
    /<ul\b[^>]*aria-labelledby=["']filtroClub["'][^>]*>([\s\S]*?)<\/ul>/i,
  )?.[1];
  if (!clubs) return [];

  const teams = new Map<string, ICevTeam>();
  for (const link of readLinks(clubs)) {
    const externalId = parseUrl(link.href).searchParams.get('club');
    const name = cleanText(link.label);
    if (externalId && name) {
      teams.set(externalId, {
        externalId,
        name,
        leagueExternalId,
        country: 'ITA',
      });
    }
  }

  return [...teams.values()];
}

export function readLegaVolleyFemminileSelectedCompetitionId(
  html: string,
): number | null {
  for (const link of html.matchAll(/<a\b([^>]*)>/gi)) {
    const attributes = link[1];
    const className = attributes.match(/\bclass=["']([^"']*)["']/i)?.[1];
    const externalId = attributes.match(/\bcampionato=(\d+)/i)?.[1];
    if (
      className?.split(/\s+/).includes('dropdown-item') &&
      className.split(/\s+/).includes('active') &&
      externalId
    ) {
      return Number(externalId);
    }
  }

  return null;
}

export function readLegaVolleyFemminileDateRange(html: string): {
  startsAt?: Date;
  endsAt?: Date;
} {
  const dateTexts = [
    ...[...html.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)]
      .map((match) => cleanText(match[1]))
      .filter((text) => /giornata/i.test(text)),
    ...[
      ...html.matchAll(
        /<table\b[^>]*class=["'][^"']*\brisultati\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi,
      ),
    ].map((match) => cleanText(match[1])),
  ];
  const dates = dateTexts.flatMap((text) =>
    [...text.matchAll(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g)].map(
      ([, day, month, year]) =>
        new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))),
    ),
  );
  if (!dates.length) return {};

  return {
    startsAt: new Date(Math.min(...dates.map((date) => date.getTime()))),
    endsAt: new Date(
      Math.max(...dates.map((date) => date.getTime() + 86_399_999)),
    ),
  };
}

export function parseLegaVolleyFemminileMatchStatistics(
  html: string,
  sourceMatchId: string,
): ILegaVolleyFemminileMatchStatistics | null {
  const tables = [
    ...html.matchAll(
      /<table\b[^>]*class=["'][^"']*\bTabellino4\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi,
    ),
  ];
  if (tables.length < 2) return null;

  const teams = tables
    .slice(0, 2)
    .map((table) => readLegaVolleyFemminilePlayerStatistics(table[1]));
  if (!teams[0].length && !teams[1].length) return null;

  return {
    matchExternalId: sourceMatchId,
    home: teams[0],
    away: teams[1],
  };
}

function readLegaVolleyFemminilePlayerStatistics(
  table: string,
): ILegaVolleyFemminilePlayerStatistic[] {
  const players: ILegaVolleyFemminilePlayerStatistic[] = [];

  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const externalId = row[1].match(/\bAtleta=([^&'"\s]+)/i)?.[1];
    if (!externalId) continue;

    const cells = [
      ...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi),
    ].map((cell) => cleanText(cell[1]));
    if (cells.length < 23) continue;

    const rawName = cells[1];
    const fullName = rawName.replace(/\s+\((?:C|L)\)\s*$/i, '').trim();
    if (!fullName) continue;

    players.push({
      externalId: decodeURIComponent(externalId),
      fullName,
      birthYear: null,
      shirtNumber: readNumber(cells[0]),
      position: /\(L\)\s*$/i.test(rawName) ? 'Libero' : null,
      attempts: readNumber(cells[17]) ?? 0,
      successful: readNumber(cells[20]) ?? 0,
      points: readNumber(cells[7]) ?? 0,
      setsPlayed: cells
        .slice(2, 7)
        .filter((value) => value !== '' && value !== '.').length,
    });
  }

  return players;
}

export function parseLegaVolleyFemminileTeamRoster(
  html: string,
): ILegaVolleyFemminilePlayer[] {
  const players: ILegaVolleyFemminilePlayer[] = [];

  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [
      ...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi),
    ].map((cell) => cleanText(cell[1]));
    const externalId = row[1].match(/\/player\/[^/]+\/([^/'"\s]+)\//i)?.[1];
    const shirtNumber = readNumber(cells[0] ?? '');
    const fullName = `${cells[1] ?? ''} ${cells[2] ?? ''}`.trim();
    if (!externalId || shirtNumber === null || !fullName) continue;

    players.push({
      externalId: decodeURIComponent(externalId),
      fullName,
      birthYear: readNumber(cells[6] ?? ''),
      shirtNumber,
      position: cells[3] || null,
    });
  }

  return players;
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
        serie: readCompetitionSerie(url, name),
        name,
        seasonYear: season.year,
        seasonName: season.name,
      });
    }
  }

  return [...competitions.values()];
}

function readCompetitionSerie(url: URL, name: string): number {
  const rawSerie = url.searchParams.get('serie');
  if (rawSerie !== null && /^\d+$/.test(rawSerie)) {
    return Number(rawSerie);
  }

  return /\bA2\b/i.test(name) ? 2 : 1;
}

function getCompetitionHierarchy(name: string): {
  championshipName: string;
  stageName: string;
  leagueName: string;
} {
  const group = name.match(/\s+(Girone\s+[A-Z0-9]+)$/i)?.[1];
  const stageName = group ? name.slice(0, -group.length).trim() : name;

  return {
    championshipName: /\bA2\b/i.test(stageName) ? 'Serie A2' : 'Serie A1',
    stageName,
    leagueName: group ?? stageName,
  };
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
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function readNumber(value: string): number | null {
  return /^-?\d+$/.test(value) ? Number(value) : null;
}

function hashId(value: string): number {
  let hash = 0;
  const key = `legavolley_femminile:${value}`;
  for (let index = 0; index < key.length; index++) {
    hash = (hash * 31 + key.charCodeAt(index)) | 0;
  }
  return 1_000_000_000 + Math.abs(hash % 900_000_000);
}
