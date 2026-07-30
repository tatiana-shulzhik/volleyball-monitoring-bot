import { ICevPlayerStatistics } from '../interfaces/requests/player-statistics.interface';
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

function parseNumber(value: string | undefined): number | null {
  const parsed = Number(value?.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
