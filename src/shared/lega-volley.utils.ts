import { ICevChampionship } from '../interfaces/requests/championships.interface';
import { ICevCompetitionStage } from '../interfaces/requests/competition-stages.interface';
import { ICevLeague } from '../interfaces/requests/leagues.interface';
import { ICevTeam } from '../interfaces/requests/teams.interface';
import { ICevMatch } from '../interfaces/requests/matches.interface';
import {
  ILegaCatalog,
  ILegaCompetitionName,
  ILegaDateRange,
  ILegaOption,
  ILegaPlayer,
  ILegaMatchPlayerStatistic,
  ILegaMatchStatistics,
} from '../interfaces/requests/lega-volley.interface';
import { CHAMPIONSHIP_RULES, STAGE_RULES } from './consts/constants';
import { ECompetitionType, EMatchStatus } from './enums';

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
  const stageRule = STAGE_RULES.find(({ pattern }) => pattern.test(cleanName));
  const stageName = stageRule?.name ?? cleanName;

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

export function readLegaMatches(
  html: string,
  leagueExternalId: number,
  year: number,
): ICevMatch[] {
  const matches = new Map<string, ICevMatch>();
  const teamsByName = new Map(
    readLegaTeams(html, leagueExternalId).map((team) => [
      normalizeLegaName(team.name),
      team.externalId,
    ]),
  );

  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    const teamMatches = [
      ...row.matchAll(
        /href=["'][^"']*(?:\/|^)team\/(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
      ),
    ];
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (match) => cleanLegaText(match[1]),
    );
    const homeTeamExternalId =
      teamMatches[0]?.[1] ?? teamsByName.get(normalizeLegaName(cells[2] ?? ''));
    const awayTeamExternalId =
      teamMatches[1]?.[1] ?? teamsByName.get(normalizeLegaName(cells[4] ?? ''));
    if (!homeTeamExternalId || !awayTeamExternalId) continue;

    const matchNumber = (
      teamMatches.length >= 2 ? cells[0] : cells.at(-1)
    )?.match(/^\d+$/)?.[0];
    if (!matchNumber) continue;

    const externalId = `legavolley:${year}:${leagueExternalId}:${matchNumber}`;
    const rowText = cleanLegaText(row);
    const status = /annullat|cancel/i.test(rowText)
      ? EMatchStatus.Cancelled
      : /\b\d+\s*-\s*\d+\b/.test(cells[5] ?? rowText)
        ? EMatchStatus.Finished
        : EMatchStatus.Scheduled;
    const scheduledAt =
      parseLegaScheduleDate(cells[0], cells[1]) ??
      parseLegaMatchDate(html.slice(0, rowMatch.index ?? 0));

    matches.set(externalId, {
      externalId,
      leagueExternalId,
      homeTeamExternalId,
      awayTeamExternalId,
      scheduledAt,
      status,
    });
  }

  return [...matches.values()];
}

export function parseLegaTeamPage(
  html: string,
  fallbackName: string,
  teamExternalId = '',
): { name: string; country: string; players: ILegaPlayer[] } {
  const title = html.match(
    /<(?:h1|h2|title)[^>]*>([\s\S]*?)<\/(?:h1|h2|title)>/i,
  )?.[1];
  return {
    name: title ? cleanLegaText(title) : fallbackName,
    country: 'ITA',
    players: extractLegaPlayers(html, teamExternalId),
  };
}

export function parseLegaMatchStatistics(
  html: string,
  sourceMatchId: string,
  leagueExternalId: number,
  playedOn: Date | null,
): ILegaMatchStatistics | null {
  const tables = [
    ...html.matchAll(
      /<table\b[^>]*id=["']Tabellino["'][^>]*>[\s\S]*?<\/table>/gi,
    ),
  ];
  const teamTables = tables.filter((table) => /Atleta=/i.test(table[0]));
  if (teamTables.length < 2) return null;

  const parseTeam = (table: string) => {
    const title = table.match(
      /class=["']HeadCol["'][^>]*>[\s\S]*?([^<]+?)\s*<\/td>/i,
    )?.[1];
    const players: ILegaMatchPlayerStatistic[] = [];
    for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const player = row[1].match(/Atleta=([^&"']+)/i)?.[1];
      if (!player) continue;
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (cell) => cleanLegaText(cell[1]),
      );
      const shirtNumber = parseLegaNumber(cells[0]);
      const points = parseLegaNumber(cells[8]);
      players.push({
        externalId: player,
        shirtNumber,
        points,
        played: cells.slice(3, 8).some((value) => value.length > 0),
      });
    }
    return { name: title ? cleanLegaText(title) : '', players };
  };

  const home = parseTeam(teamTables[0][0]);
  const away = parseTeam(teamTables[1][0]);
  return home.name && away.name
    ? {
        sourceMatchId,
        leagueExternalId,
        playedOn,
        homeTeamName: home.name,
        awayTeamName: away.name,
        home: home.players,
        away: away.players,
      }
    : null;
}

export function readLegaMatchIds(html: string): string[] {
  return [
    ...new Set(
      [...html.matchAll(/href=["']\/?match\/(\d+)/gi)].map((match) => match[1]),
    ),
  ];
}

export function parseLegaPostGaraDate(value: string): Date | null {
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match
    ? new Date(
        Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])),
      )
    : null;
}

export function createLegaMatchKey(
  leagueExternalId: number,
  homeTeamExternalId: string,
  awayTeamExternalId: string,
  scheduledAt: Date | null,
): string {
  return `${leagueExternalId}:${homeTeamExternalId}:${awayTeamExternalId}:${scheduledAt?.toISOString().slice(0, 10) ?? ''}`;
}

export function normalizeLegaName(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function extractLegaPlayers(
  html: string,
  teamExternalId: string,
): ILegaPlayer[] {
  const players = new Map<string, ILegaPlayer>();
  const rosterHtml = extractLegaRosterHtml(html);

  for (const rowMatch of rosterHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    const playerMatch = row.match(
      /<a\b[^>]*href=["'][^"']*\/player\/([^"'?#]+)[^>]*>([\s\S]*?)<\/a>/i,
    );
    if (!playerMatch) continue;

    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (match) => cleanLegaText(match[1]),
    );
    const playerCellIndex = cells.findIndex((cell) =>
      cell.includes(cleanLegaText(playerMatch[2])),
    );
    const shirtNumber = parseLegaNumber(
      cells[playerCellIndex > 0 ? playerCellIndex - 1 : 0],
    );
    const birthYear = parseLegaYear(cells.join(' '));
    const position =
      playerCellIndex >= 0
        ? (cells.slice(playerCellIndex + 1).find(isLegaPlayerPosition) ?? null)
        : null;
    const fullName = cleanLegaText(playerMatch[2]);

    if (fullName) {
      players.set(playerMatch[1], {
        externalId: playerMatch[1],
        fullName,
        shirtNumber,
        position,
        birthYear,
        teamExternalId,
        leagueExternalId: 0,
      });
    }
  }

  return [...players.values()];
}

function extractLegaRosterHtml(html: string): string {
  const roster = html.match(
    /<h[1-6]\b[^>]*>\s*Roster\s*<\/h[1-6]>([\s\S]*?)(?=<h[1-6]\b|$)/i,
  );

  return roster?.[1] ?? html;
}

function isLegaPlayerPosition(value: string): boolean {
  return [
    'schiacciatore',
    'opposto',
    'centrale',
    'palleggiatore',
    'libero',
  ].includes(value.trim().toLowerCase());
}

function parseLegaNumber(value: string | undefined): number | null {
  const number = value?.match(/^\d+$/)?.[0];
  return number ? Number(number) : null;
}

function parseLegaYear(value: string): number | null {
  const year = value.match(/\b(?:19|20)\d{2}\b/)?.[0];
  return year ? Number(year) : null;
}

function parseLegaMatchDate(value: string): Date | null {
  const months: Record<string, number> = {
    gennaio: 0,
    febbraio: 1,
    marzo: 2,
    aprile: 3,
    maggio: 4,
    giugno: 5,
    luglio: 6,
    agosto: 7,
    settembre: 8,
    ottobre: 9,
    novembre: 10,
    dicembre: 11,
  };
  const matches = [
    ...cleanLegaText(value).matchAll(
      /Giornata[\s\S]{0,120}?\b(\d{1,2})\s+([A-Za-zàèéìòù]+)\s+(\d{4})(?:\s+Ore\s+(\d{1,2}):(\d{2}))?/gi,
    ),
  ];
  const match = matches.at(-1);
  if (!match) return null;

  const month = months[match[2].toLocaleLowerCase('it-IT')];
  return month === undefined
    ? null
    : new Date(
        Date.UTC(
          Number(match[3]),
          month,
          Number(match[1]),
          Number(match[4] ?? 0),
          Number(match[5] ?? 0),
        ),
      );
}

function parseLegaScheduleDate(
  dateValue: string | undefined,
  timeValue: string | undefined,
): Date | null {
  const date = dateValue?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!date) return null;

  const time = timeValue?.match(/^(\d{1,2}):(\d{2})$/);
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

function getChampionshipName(name: string): string {
  return (
    CHAMPIONSHIP_RULES.find(({ pattern }) => pattern.test(name))?.name ?? name
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
