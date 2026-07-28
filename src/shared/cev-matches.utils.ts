import { ICevMatch } from '../interfaces/requests/matches.interface';
import { EMatchStatus } from './enums';

const MATCH_START = /<tr\b[^>]*class=['"]rlv[IA]['"][^>]*>/gi;
const MATCH_LINK =
  /MatchPage\.aspx\?mID=(\d+)(?:&amp;|&)ID=\d+(?:&amp;|&)CID=(\d+)/i;
const TEAM_ID = /TeamLogos\/Teams_WebLogo_32_32\.aspx\?ID=(\d+)/gi;
const SCHEDULED_AT = /LB_DataOra[^>]*>([\s\S]*?)<\/span>/i;
const HOME_SETS = /LB_SetCasa[^>]*>([\s\S]*?)<\/span>/i;
const AWAY_SETS = /LB_SetOspiti[^>]*>([\s\S]*?)<\/span>/i;

export function extractMatches(html: string): ICevMatch[] {
  const matches = new Map<string, ICevMatch>();

  for (const block of extractMatchBlocks(html)) {
    const link = block.match(MATCH_LINK);
    const teamIds = [...block.matchAll(TEAM_ID)].map((match) => match[1]);

    if (!link || teamIds.length < 2) {
      continue;
    }

    const externalId = link[1];
    const scheduledText = cleanText(block.match(SCHEDULED_AT)?.[1] ?? '');
    const scheduledAt = parseCevDate(scheduledText);
    const homeSets = Number(cleanText(block.match(HOME_SETS)?.[1] ?? '0'));
    const awaySets = Number(cleanText(block.match(AWAY_SETS)?.[1] ?? '0'));

    matches.set(externalId, {
      externalId,
      leagueExternalId: Number(link[2]),
      homeTeamExternalId: teamIds[0],
      awayTeamExternalId: teamIds[1],
      scheduledAt,
      status: resolveStatus(scheduledText, homeSets, awaySets),
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

function resolveStatus(
  scheduledText: string,
  homeSets: number,
  awaySets: number,
): EMatchStatus {
  if (/cancel/i.test(scheduledText)) {
    return EMatchStatus.Cancelled;
  }

  return homeSets > 0 || awaySets > 0
    ? EMatchStatus.Finished
    : EMatchStatus.Scheduled;
}

function parseCevDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year, hours, minutes] = match;
  return new Date(`${year}-${month}-${day}T${hours}:${minutes}:00+02:00`);
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
