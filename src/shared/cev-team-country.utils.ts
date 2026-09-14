import { CEV_COUNTRIES } from './consts/constants';
import { ICevMatchRosterPlayer } from '../interfaces/requests/player-statistics.interface';

export function extractCevTeamCountry(html: string): string | null {
  const flagCode = html
    .match(/Images\/Flags_100\/([A-Z]{3})_100\.png/i)?.[1]
    .toUpperCase();

  return flagCode ? (CEV_COUNTRIES[flagCode] ?? flagCode) : null;
}

export function extractCevPlayerBirthYears(html: string): Map<string, number> {
  const rows = /<tr\b[^>]*class=['"]rlv[IA]['"][^>]*>([\s\S]*?)<\/tr>/gi;
  const player =
    /<a\b[^>]*id=['"][^'"]*_playerDetails['"][^>]*href=['"][^'"]*PlayerID=(\d+)[^'"]*['"][^>]*>/i;
  const years = new Map<string, number>();

  for (const row of html.matchAll(rows)) {
    const playerId = row[1].match(player)?.[1];
    const birthYear = cleanText(row[1]).match(/\b(?:19|20)\d{2}\b/)?.[0];

    if (playerId && birthYear) {
      years.set(playerId, Number(birthYear));
    }
  }

  return years;
}

export function extractCevTeamPlayers(html: string): ICevMatchRosterPlayer[] {
  const rows = /<tr\b[^>]*class=['"]rlv[IA]['"][^>]*>([\s\S]*?)<\/tr>/gi;
  const playerLink =
    /<a\b[^>]*id=['"][^'"]*_playerDetails['"][^>]*href=['"][^'"]*PlayerID=(\d+)[^'"]*['"][^>]*>([\s\S]*?)<\/a>/i;
  const players = new Map<string, ICevMatchRosterPlayer>();

  for (const row of html.matchAll(rows)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (cell) => cell[1],
    );
    const playerCellIndex = cells.findIndex((cell) => playerLink.test(cell));
    const player =
      playerCellIndex >= 0 ? cells[playerCellIndex].match(playerLink) : null;

    if (!player) continue;

    const playerName = cleanText(player[2]);
    if (!playerName) continue;

    players.set(player[1], {
      externalId: player[1],
      playerName,
      shirtNumber: parseInteger(cells[playerCellIndex - 1]),
    });
  }

  return [...players.values()];
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseInteger(value: string | undefined): number | null {
  const match = cleanText(value ?? '').match(/\d+/);
  return match ? Number(match[0]) : null;
}
