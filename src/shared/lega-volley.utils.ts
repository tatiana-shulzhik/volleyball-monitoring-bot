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
  ILegaMatchReference,
  ILegaMatchStatistics,
} from '../interfaces/requests/lega-volley.interface';
import { ECompetitionType, EMatchStatus } from './enums';

export function parseLegaSeason(
  year: number,
  seasonName: string,
  html: string,
): ILegaCatalog & { year: number } {
  const championships = new Map<number, ICevChampionship>();
  const stages = new Map<string, ICevCompetitionStage>();
  const leagues: ICevLeague[] = [];
  const championshipOptions = readLegaOptions(html, 'campionato');

  for (const option of championshipOptions) {
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

    stages.set(`${championshipExternalId}:${stageExternalId}`, {
      externalId: stageExternalId,
      name: stageName,
      championshipExternalId,
      seasonName,
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
  const [competitionName, stageDetails] = cleanName.split(/\s+-\s+/, 2);
  const championshipName = getLegaChampionshipName(competitionName);
  const stageName = getLegaStageName(competitionName, stageDetails);

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
    .map(([, externalId, name]) => {
      const teamName = cleanLegaText(name);

      return {
        externalId,
        name: teamName,
        country: extractLegaTeamCountry(teamName),
        leagueExternalId,
      };
    })
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

    const matchNumber =
      teamMatches.length >= 2 ? cells[0]?.match(/^\d+$/)?.[0] : undefined;
    const externalId = `legavolley:${year}:${leagueExternalId}:${
      matchNumber ??
      [cells[0], cells[1], cells[2], cells[4]]
        .map((cell) => normalizeLegaName(cell ?? ''))
        .join(':')
    }`;
    const rowText = cleanLegaText(row);
    const score = (cells[5] ?? '').match(/\b(\d+)\s*-\s*(\d+)\b/);
    const status = /annullat|cancel/i.test(rowText)
      ? EMatchStatus.Cancelled
      : score && (Number(score[1]) > 0 || Number(score[2]) > 0)
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
  fallbackCountry?: string,
): { name: string; country: string; players: ILegaPlayer[] } {
  const title =
    html.match(
      /<div\b[^>]*class=["'][^"']*\bsquadra-nome-main\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    )?.[1] ??
    html.match(/<(?:h1|h2|title)[^>]*>([\s\S]*?)<\/(?:h1|h2|title)>/i)?.[1];
  return {
    name: title ? cleanLegaText(title) : fallbackName,
    country: fallbackCountry ?? 'ITA',
    players: extractLegaPlayers(html, teamExternalId),
  };
}

export function parseLegaMatchStatistics(
  html: string,
  sourceMatchId: string,
  leagueExternalId: number,
  playedOn: Date | null,
  teamNames?: Pick<ILegaMatchReference, 'homeTeamName' | 'awayTeamName'>,
): ILegaMatchStatistics | null {
  const tables = [
    ...html.matchAll(
      /<table\b[^>]*id=["']Tabellino["'][^>]*>[\s\S]*?<\/table>/gi,
    ),
  ];
  const playedOnFromMatch = parseLegaPostGaraDate(
    tables
      .find(([table]) => /<th\b[^>]*>\s*Data\s*<\/th>/i.test(table))?.[0]
      .match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/)?.[0] ?? '',
  );
  const actualPlayedOn = playedOnFromMatch ?? playedOn;
  const teamTables = tables.filter(
    ([table]) =>
      /Atleta=/i.test(table) && /<th\b[^>]*>\s*Voto\s*<\/th>/i.test(table),
  );
  if (teamTables.length < 2) {
    const summaryTeamNames = [
      ...(tables[0]?.[0].matchAll(
        /<td\b[^>]*title=["']Statistiche Squadra["'][^>]*>[\s\S]*?<span\b[^>]*>([\s\S]*?)<\/span>/gi,
      ) ?? []),
    ].map((match) => cleanLegaText(match[1]));
    const homeTeamName = teamNames?.homeTeamName ?? summaryTeamNames[0];
    const awayTeamName = teamNames?.awayTeamName ?? summaryTeamNames[1];

    return homeTeamName && awayTeamName
      ? {
          sourceMatchId,
          leagueExternalId,
          playedOn: actualPlayedOn,
          homeTeamName,
          awayTeamName,
          home: [],
          away: [],
        }
      : null;
  }

  const parseTeam = (table: string) => {
    const title =
      table.match(
        /class=["']HeadCol["'][^>]*>[\s\S]*?([^<]+?)\s*<\/td>/i,
      )?.[1] ?? table.match(/<th\b[^>]*>[\s\S]*?([^<]+?)\s*<\/th>/i)?.[1];
    const players: ILegaMatchPlayerStatistic[] = [];
    for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const player = row[1].match(/Atleta=([^&"']+)/i)?.[1];
      if (!player) continue;
      const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
        (cell) => cleanLegaText(cell[1]),
      );
      const compactTable = cells.length <= 5;
      players.push({
        externalId: player,
        attempts: compactTable ? 0 : (parseLegaNumber(cells[18]) ?? 0),
        successful: compactTable ? 0 : (parseLegaNumber(cells[21]) ?? 0),
        points: parseLegaNumber(compactTable ? cells.at(-1) : cells[8]) ?? 0,
        setsPlayed: compactTable
          ? (parseLegaNumber(cells[0]) ?? 0)
          : cells.slice(3, 8).filter((value) => value.length > 0).length,
      });
    }
    return { name: title ? cleanLegaText(title) : '', players };
  };

  const home = parseTeam(teamTables[0][0]);
  const away = parseTeam(teamTables[1][0]);
  const homeTeamName = home.name || teamNames?.homeTeamName;
  const awayTeamName = away.name || teamNames?.awayTeamName;
  return homeTeamName && awayTeamName
    ? {
        sourceMatchId,
        leagueExternalId,
        playedOn: actualPlayedOn,
        homeTeamName,
        awayTeamName,
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

export function readLegaMatchReferences(html: string): ILegaMatchReference[] {
  const references: ILegaMatchReference[] = [];

  for (const section of html.matchAll(
    /<h3\b[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)(?=<h3\b|$)/gi,
  )) {
    const sourceMatchId = section[2].match(/href=["']\/?match\/(\d+)/i)?.[1];
    const teams = cleanLegaText(section[1]).match(/^(.+?)\s+-\s+(.+)$/);
    if (!sourceMatchId || !teams) continue;

    references.push({
      sourceMatchId,
      homeTeamName: teams[1].trim(),
      awayTeamName: teams[2].trim(),
    });
  }

  return references;
}

export function parseLegaPostGaraDate(value: string): Date | null {
  const match = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return match
    ? new Date(
        Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])),
      )
    : null;
}

export function createLegaMatchLookupKey(
  leagueExternalId: number,
  homeTeamName: string,
  awayTeamName: string,
  scheduledAt: Date | null,
): string {
  return `${leagueExternalId}:${normalizeLegaName(homeTeamName)}:${normalizeLegaName(awayTeamName)}:${scheduledAt?.toISOString().slice(0, 10) ?? ''}`;
}

export function normalizeLegaName(value: string): string {
  return value
    .toLocaleLowerCase('it-IT')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function extractLegaTeamCountry(value: string): string | undefined {
  return value.match(/\(([a-z]{3})\)\s*$/i)?.[1]?.toUpperCase();
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
    const birthYear = parseLegaYear(cells[playerCellIndex + 2] ?? '');
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
    /<table\b(?=[^>]*\bid=["']roster["'])[^>]*>[\s\S]*?<\/table>/i,
  );

  return roster?.[0] ?? '';
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

function getLegaChampionshipName(name: string): string {
  // European competitions
  if (/\bChampions League\b/i.test(name)) {
    return 'Champions League';
  }

  if (
    /\b(?:CEV\s+)?Volleyball Cup\b/i.test(name) ||
    /\bCEV Cup\b/i.test(name)
  ) {
    return 'CEV Cup';
  }

  if (/\bChallenge Cup\b/i.test(name)) {
    return 'Challenge Cup';
  }

  // Coppa Italia
  if (/\bCoppa Italia\b.*\bSuperLega\b/i.test(name)) {
    return 'Coppa Italia SuperLega';
  }

  if (/\bCoppa Italia\b.*\bA2\b/i.test(name)) {
    return 'Coppa Italia A2';
  }

  if (/\bCoppa Italia\b.*\bA3\b/i.test(name)) {
    return 'Coppa Italia A3';
  }

  // Supercoppa
  if (/\bSupercoppa\b.*\bA2\b/i.test(name)) {
    return 'Supercoppa A2';
  }

  if (/\bSupercoppa\b.*\bA3\b/i.test(name)) {
    return 'Supercoppa A3';
  }

  if (
    /\bSupercoppa\b.*\bSuperLega\b/i.test(name) ||
    /\bDel Monte Supercoppa\b/i.test(name)
  ) {
    return 'Supercoppa SuperLega';
  }

  // SuperLega
  if (
    /\bSuperLega\b/i.test(name) ||
    /\b(?:Play Off\s+)?(?:3|5)\s*(?:°|o)?\s*Posto\b/i.test(name) ||
    /\b(?:Play Off\s+)?Finale\s+3\s*(?:°|o)?\s*Posto\b/i.test(name)
  ) {
    return 'SuperLega';
  }

  // Serie A2
  if (/\b(?:Serie\s+)?A2\b/i.test(name)) {
    return 'Serie A2';
  }

  // Serie A3
  if (/\b(?:Serie\s+)?A3\b/i.test(name)) {
    return 'Serie A3';
  }

  return name.trim();
}

function getLegaStageName(
  competitionName: string,
  stageDetails: string | undefined,
): string {
  const stage = competitionName.match(
    /^(Regular Season|Main Phase|Early Round|1st Round|2nd Round|Play Off\s+(?:3|5)\s*(?:°|o)?\s*Posto|(?:Play Off\s+)?Finale\s+3\s*(?:°|o)?\s*Posto|(?:Play Off\s+)?(?:3|5)\s*(?:°|o)?\s*Posto|Play Off|Play Out)\b/i,
  )?.[1];
  const baseStage = stage ?? stageDetails ?? competitionName;

  return stageDetails && stage
    ? `${baseStage} - ${stageDetails}`
    : !stageDetails && !stage
      ? 'Main'
      : baseStage;
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

export function readLegaDateRange(html: string): ILegaDateRange {
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
