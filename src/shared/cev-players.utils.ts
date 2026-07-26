import {
  ExtractPlayersParams,
  ICevPlayer,
} from '../interfaces/requests/players.interface';

const PLAYER_ROW = /<tr\b[^>]*class=['"]rlv[IA]['"][^>]*>([\s\S]*?)<\/tr>/gi;
const PLAYER_DETAILS =
  /<a\b[^>]*id=['"][^'"]*_playerDetails['"][^>]*href=['"][^'"]*PlayerID=(\d+)[^'"]*['"][^>]*>([\s\S]*?)<\/a>\s*<\/td>\s*<td\b[^>]*>([\s\S]*?)<\/td>/i;

export function extractPlayers(data: ExtractPlayersParams): ICevPlayer[] {
  const { html, teamExternalId, seasonExternalId } = data;
  const players = new Map<string, ICevPlayer>();

  for (const rowMatch of html.matchAll(PLAYER_ROW)) {
    const playerMatch = rowMatch[1].match(PLAYER_DETAILS);

    if (!playerMatch) {
      continue;
    }

    const externalId = playerMatch[1];
    const fullName = cleanText(playerMatch[2]);
    const position = cleanText(playerMatch[3]);

    if (fullName) {
      players.set(externalId, {
        externalId,
        fullName,
        position,
        teamExternalId,
        seasonExternalId,
      });
    }
  }

  return [...players.values()];
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
