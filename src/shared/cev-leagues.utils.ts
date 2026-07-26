import { ICevLeague } from '../interfaces/requests/leagues.interface';

const LEAGUE_FIELDSET = /<fieldset\b[^>]*>([\s\S]*?)<\/fieldset>/gi;
const LEAGUE_ID = /CompetitionStandings\.aspx\?[^'"]*\bCID=(\d+)[^'"]*/i;
const LEAGUE_NAME =
  /CalendarOverview_Championship_Header[^>]*>[\s\S]*?<div\b[^>]*>([\s\S]*?)<\/div>/i;

export function extractLeagues(
  html: string,
  championshipExternalId: number,
): ICevLeague[] {
  const leagues = new Map<number, ICevLeague>();

  for (const fieldsetMatch of html.matchAll(LEAGUE_FIELDSET)) {
    const fieldset = fieldsetMatch[1];
    const idMatch = fieldset.match(LEAGUE_ID);
    const nameMatch = fieldset.match(LEAGUE_NAME);

    if (!idMatch || !nameMatch) {
      continue;
    }

    const externalId = Number(idMatch[1]);
    const name = cleanText(nameMatch[1]);

    if (!name) {
      continue;
    }

    leagues.set(externalId, {
      externalId,
      name,
      championshipExternalId,
    });
  }

  return [...leagues.values()];
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ');
}
