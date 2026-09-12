import { ICevMatch } from '../interfaces/requests/matches.interface';
import { EMatchStatus } from './enums';
import {
  parseCevLocalDate,
  resolveCevVenueTimeZone,
} from './cev-timezone.utils';

const MATCH_START = /<tr\b[^>]*class=['"]rlv[IA]['"][^>]*>/gi;
const MATCH_LINK =
  /MatchPage\.aspx\?mID=(\d+)(?:&amp;|&)ID=\d+(?:&amp;|&)CID=(\d+)/i;
const TEAM_ID = /TeamLogos\/Teams_WebLogo_32_32\.aspx\?ID=(\d+)/gi;
const SCHEDULED_AT = /LB_DataOra[^>]*>([\s\S]*?)<\/span>/i;
const VENUE = /LB_Palasport[^>]*>([\s\S]*?)<\/span>/i;

export function extractMatches(
  html: string,
  countryCodesByLeague = new Map<number, string>(),
): ICevMatch[] {
  const matches = new Map<string, ICevMatch>();

  for (const block of extractMatchBlocks(html)) {
    const link = block.match(MATCH_LINK);
    const teamIds = [...block.matchAll(TEAM_ID)].map((match) => match[1]);

    if (!link || teamIds.length < 2) {
      continue;
    }

    const externalId = link[1];
    const leagueExternalId = Number(link[2]);
    const scheduledText = cleanText(block.match(SCHEDULED_AT)?.[1] ?? '');
    const venue = cleanText(block.match(VENUE)?.[1] ?? '');

    matches.set(externalId, {
      externalId,
      leagueExternalId,
      homeTeamExternalId: teamIds[0],
      awayTeamExternalId: teamIds[1],
      scheduledAt: null,
      scheduledText,
      venue,
      venueCountryCode: countryCodesByLeague.get(leagueExternalId),
      status: resolveStatus(scheduledText),
    });
  }

  return [...matches.values()];
}

function extractMatchBlocks(html: string): string[] {
  const starts = [...html.matchAll(MATCH_START)]
    .map(({ index }) => index)
    .filter((index): index is number => index !== undefined);

  return starts.map((start, index) =>
    html.slice(start, starts[index + 1] ?? html.length),
  );
}

function resolveStatus(scheduledText: string): EMatchStatus {
  if (/cancel/i.test(scheduledText)) {
    return EMatchStatus.Cancelled;
  }

  // Счёт по сетам появляется уже во время матча и не означает его завершение.
  return EMatchStatus.Scheduled;
}

export function parseCevDate(
  value: string,
  venue: string,
  countryCode?: string,
): Date | null {
  if (!/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(value)) {
    return null;
  }

  return parseCevLocalDate(value, resolveCevVenueTimeZone(venue, countryCode));
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
