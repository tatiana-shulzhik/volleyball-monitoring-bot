import { ICevLeague } from '../interfaces/requests/leagues.interface';
import { ICevTeam } from '../interfaces/requests/teams.interface';

const LEAGUE_FIELDSET = /<fieldset\b[^>]*>([\s\S]*?)<\/fieldset>/gi;
const LEAGUE_NAME =
  /CalendarOverview_Championship_Header[^>]*>[\s\S]*?<div\b[^>]*>([\s\S]*?)<\/div>/i;
const TEAM =
  /CompetitionTeamDetails\.aspx\?TeamID=(\d+)(?:&amp;|&)ID=\d+[\s\S]*?<span\b[^>]*LB_Home[^>]*>([\s\S]*?)<\/span>/gi;

export function extractTeams(
  html: string,
  leagues: Pick<ICevLeague, 'externalId' | 'name'>[],
): ICevTeam[] {
  const leaguesByName = new Map(leagues.map((league) => [league.name, league]));
  const teams = new Map<string, ICevTeam>();

  for (const fieldsetMatch of html.matchAll(LEAGUE_FIELDSET)) {
    const fieldset = fieldsetMatch[1];
    const nameMatch = fieldset.match(LEAGUE_NAME);
    const league = nameMatch
      ? leaguesByName.get(cleanText(nameMatch[1]))
      : undefined;

    if (!league) {
      continue;
    }

    for (const teamMatch of fieldset.matchAll(TEAM)) {
      const externalId = teamMatch[1];
      const name = cleanText(teamMatch[2]);

      if (name) {
        teams.set(`${league.externalId}:${externalId}`, {
          externalId,
          name,
          leagueExternalId: league.externalId,
        });
      }
    }
  }

  return [...teams.values()];
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
