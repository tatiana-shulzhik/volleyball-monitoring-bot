import { ICevLeague } from '../interfaces/requests/leagues.interface';

const LEAGUE_FIELDSET = /<fieldset\b[^>]*>([\s\S]*?)<\/fieldset>/gi;
const LEAGUE_ID = /CompetitionStandings\.aspx\?[^'"]*\bCID=(\d+)[^'"]*/i;
const LEAGUE_NAME =
  /CalendarOverview_Championship_Header[^>]*>[\s\S]*?<div\b[^>]*>([\s\S]*?)<\/div>/i;
const LEAGUE_TAB =
  /<a\b(?=[^>]*\btitle=['"]([^'"]+)['"])(?=[^>]*\bRTB_Championship_Black)[^>]*>/gi;
const LEAGUE_VIEW =
  /<div\s+id=['"]Content_Left_(\d+)['"]\s+class=['"]rmpView\b/gi;

export function extractLeagues(
  html: string,
  stageExternalId: number,
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
      stageExternalId,
    });
  }

  return [...leagues.values()];
}

export function extractLeagueCountryCode(name: string): string | undefined {
  return name.match(/\b(?:in|matches in)\s+([A-Z]{3})\b/i)?.[1].toUpperCase();
}

export function extractLeagueCountryCodes(html: string): Map<number, string> {
  const names = [...html.matchAll(LEAGUE_TAB)].map((match) => match[1]);
  const externalIds = [...html.matchAll(LEAGUE_VIEW)].map((match) =>
    Number(match[1]),
  );

  return new Map(
    externalIds.flatMap((externalId, index) => {
      const countryCode = extractLeagueCountryCode(names[index] ?? '');

      return countryCode ? [[externalId, countryCode] as const] : [];
    }),
  );
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
