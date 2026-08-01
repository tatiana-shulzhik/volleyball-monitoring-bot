import {
  IExtractPlayersParams,
  ICevPlayer,
} from '../interfaces/requests/players.interface';
import { CEV_COUNTRIES } from './consts/constants';

const PLAYER_ROW = /<tr\b[^>]*class=['"]rlv[IA]['"][^>]*>([\s\S]*?)<\/tr>/gi;
const TABLE_CELL = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
const PLAYER_DETAILS =
  /<a\b[^>]*id=['"][^'"]*_playerDetails['"][^>]*href=['"][^'"]*PlayerID=(\d+)[^'"]*['"][^>]*>([\s\S]*?)<\/a>/i;

export function extractPlayers(data: IExtractPlayersParams): ICevPlayer[] {
  const { html, teamExternalId, leagueExternalId } = data;
  const players = new Map<string, ICevPlayer>();

  for (const rowMatch of html.matchAll(PLAYER_ROW)) {
    const cells = [...rowMatch[1].matchAll(TABLE_CELL)].map(
      (match) => match[1],
    );
    const playerCellIndex = cells.findIndex((cell) =>
      PLAYER_DETAILS.test(cell),
    );
    const playerMatch =
      playerCellIndex >= 0
        ? cells[playerCellIndex].match(PLAYER_DETAILS)
        : null;

    if (!playerMatch) {
      continue;
    }

    const externalId = playerMatch[1];
    const fullName = cleanText(playerMatch[2]);
    const shirtNumber = parseShirtNumber(cells[playerCellIndex - 1]);
    const position = cleanText(cells[playerCellIndex + 1] ?? '');
    const birthYear = parseBirthYear(cells[playerCellIndex + 4]);

    if (fullName) {
      players.set(externalId, {
        externalId,
        fullName,
        position,
        shirtNumber,
        birthYear,
        teamExternalId,
        leagueExternalId,
      });
    }
  }

  return [...players.values()];
}

export function extractTeamCountry(html: string): string | null {
  const flagCode = html
    .match(/Images\/Flags_100\/([A-Z]{3})_100\.png/i)?.[1]
    .toUpperCase();

  return flagCode ? (CEV_COUNTRIES[flagCode] ?? flagCode) : null;
}

function parseBirthYear(value: string | undefined): number | null {
  const year = cleanText(value ?? '').match(/\b(?:19|20)\d{2}\b/)?.[0];
  return year ? Number(year) : null;
}

function parseShirtNumber(value: string | undefined): number | null {
  const number = cleanText(value ?? '').match(/\d+/)?.[0];
  return number ? Number(number) : null;
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
