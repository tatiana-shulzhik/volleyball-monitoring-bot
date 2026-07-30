import { ICevCompetitionStage } from '../interfaces/requests/competition-stages.interface';

const CHAMPIONSHIP_LINK =
  /<a\b[^>]*href=['"][^'"]*Competition\.aspx\?ID=(\d+)(?:&amp;|&)PID=(\d+)[^'"]*['"][^>]*>([\s\S]*?)<\/a>/gi;

export function extractChampionships(
  html: string,
  championshipExternalId: number,
): ICevCompetitionStage[] {
  const stages = new Map<number, ICevCompetitionStage>();

  for (const match of html.matchAll(CHAMPIONSHIP_LINK)) {
    const linkedSeasonId = Number(match[1]);
    const externalId = Number(match[2]);
    const name = cleanText(match[3]);

    if (
      linkedSeasonId !== championshipExternalId ||
      externalId < 0 ||
      !name ||
      name === 'Final Standing'
    ) {
      continue;
    }

    stages.set(externalId, {
      externalId,
      name,
      championshipExternalId,
    });
  }

  return [...stages.values()];
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
