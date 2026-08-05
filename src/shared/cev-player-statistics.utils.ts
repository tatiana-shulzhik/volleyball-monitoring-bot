import {
  ICevMatchRosterPlayer,
  ICevPlayerAttackStatistics,
  ICevPlayerStatistics,
} from '../interfaces/requests/player-statistics.interface';
import { createPostbackForm } from './aspnet-form.utils';

const PHASE_CONTROL = 'ctl00$Content_Left$DDL_Phases';

export function getStatisticsPhaseIds(html: string): Set<number> {
  const select = html.match(
    /<select\b[^>]*id=["']Content_Left_DDL_Phases["'][^>]*>([\s\S]*?)<\/select>/i,
  )?.[1];

  return new Set(
    [...(select?.matchAll(/<option\b[^>]*value=["'](\d+)["'][^>]*>/gi) ?? [])]
      .map((match) => Number(match[1]))
      .filter((id) => id > 0),
  );
}

export function createStatisticsPhaseForm(
  html: string,
  stageExternalId: number,
): URLSearchParams {
  const form = createPostbackForm(html);

  form.set('__EVENTTARGET', PHASE_CONTROL);
  form.set('__EVENTARGUMENT', '');
  form.set(PHASE_CONTROL, String(stageExternalId));

  return form;
}

const SCORER_TABLE =
  /<table\b[^>]*id=['"][^'"]*Ranking_BestScorer_RadGrid_Score_ctl00['"][^>]*>([\s\S]*?)<\/table>/i;
const TABLE_ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
const TABLE_CELL = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;

export function extractPlayerStatistics(html: string): ICevPlayerStatistics[] {
  const table = html.match(SCORER_TABLE)?.[1];

  if (!table) {
    return [];
  }

  const result: ICevPlayerStatistics[] = [];

  for (const row of table.matchAll(TABLE_ROW)) {
    const cells = [...row[1].matchAll(TABLE_CELL)].map((match) =>
      cleanText(match[1]),
    );
    const played = cells[3]?.match(/^(\d+)\s*\(\s*(\d+)\s*\)$/);
    const points = parseNumber(cells[4]);
    const rating = parseNumber(cells[5]);

    if (cells.length < 6 || !played || points === null || rating === null) {
      continue;
    }

    result.push({
      playerName: cells[1],
      teamName: cells[2],
      matchesPlayed: Number(played[1]),
      setsPlayed: Number(played[2]),
      points,
      rating,
    });
  }

  return result;
}

export function extractPlayerAttackStatistics(
  html: string,
  side: 'casa' | 'ospiti',
): ICevPlayerAttackStatistics[] {
  const values = new Map<
    number,
    Partial<ICevPlayerAttackStatistics> & { successfulPercentage?: number }
  >();
  const field =
    /id=["']GV_elenco_(casa|ospiti|fuori)_L_(Nome|SpikeTot|SpikePos0?)_(\d+)["'][^>]*>([\s\S]*?)</gi;

  for (const match of html.matchAll(field)) {
    const sourceSide =
      match[1].toLowerCase() === 'fuori' ? 'ospiti' : match[1].toLowerCase();

    if (sourceSide !== side) {
      continue;
    }

    const index = Number(match[3]);
    const row = values.get(index) ?? {};
    const value = cleanText(match[4]);

    if (match[2] === 'Nome') {
      row.playerName = value;
    } else if (match[2] === 'SpikeTot') {
      row.attempts = parseInteger(value) ?? 0;
    } else if (match[2] === 'SpikePos0') {
      const successful = parseInteger(value);

      if (successful !== null) {
        row.successful = successful;
      }
    } else {
      const successfulPercentage = parseInteger(value);

      if (successfulPercentage !== null) {
        row.successfulPercentage = successfulPercentage;
      }
    }

    values.set(index, row);
  }

  return [...values.values()].flatMap((row) => {
    if (!row.playerName || row.attempts === undefined) {
      return [];
    }

    const successful =
      row.successful ??
      Math.round((row.attempts * (row.successfulPercentage ?? 0)) / 100);
    return [
      {
        playerName: row.playerName,
        attempts: row.attempts,
        successful,
      },
    ];
  });
}

export function extractMatchRoster(
  html: string,
  side: 'home' | 'guest',
): ICevMatchRosterPlayer[] {
  const gridName = side === 'home' ? 'Home' : 'Guest';
  const rowPattern = new RegExp(
    `<tr\\b[^>]*id=["'][^"']*RG_Roster${gridName}[^"']*["'][^>]*>` +
      `([\\s\\S]*?)<\\/tr>`,
    'gi',
  );
  const players = new Map<string, ICevMatchRosterPlayer>();

  for (const row of html.matchAll(rowPattern)) {
    const player = row[1].match(
      /<a\b(?=[^>]*href=["'][^"']*PlayerDetails\.aspx\?[^"']*PlayerID=(\d+))[^>]*>([\s\S]*?)<\/a>/i,
    );

    if (!player) {
      continue;
    }

    const linkText = cleanText(player[2]);
    const details = linkText.match(/^(\d+)\s+(.+)$/);
    const cells = [...row[1].matchAll(TABLE_CELL)].map((match) =>
      cleanText(match[1]),
    );
    const shirtNumber = details
      ? Number(details[1])
      : parseInteger(cells.find((cell) => /^\d+$/.test(cell)));
    const playerName = details?.[2] ?? linkText;

    if (!playerName) {
      continue;
    }

    players.set(player[1], {
      externalId: player[1],
      playerName,
      shirtNumber,
    });
  }

  return [...players.values()];
}

function parseNumber(value: string | undefined): number | null {
  const parsed = Number(value?.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string | undefined): number | null {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
