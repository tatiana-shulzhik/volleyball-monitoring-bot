import { ICevChampionship } from '../interfaces/requests/championships.interface';

const CHAMPIONSHIP_LINK =
  /<a\b[^>]*href=['"][^'"]*Competition\.aspx\?ID=(\d+)(?:&amp;|&)PID=(\d+)[^'"]*['"][^>]*>([\s\S]*?)<\/a>/gi;

export function extractChampionships(
  html: string,
  seasonExternalId: number,
): ICevChampionship[] {
  const championships = new Map<number, ICevChampionship>();

  for (const match of html.matchAll(CHAMPIONSHIP_LINK)) {
    const linkedSeasonId = Number(match[1]);
    const externalId = Number(match[2]);
    const name = cleanText(match[3]);

    if (
      linkedSeasonId !== seasonExternalId ||
      externalId < 0 ||
      !name ||
      name === 'Final Standing'
    ) {
      continue;
    }

    championships.set(externalId, {
      externalId,
      name,
      seasonExternalId,
    });
  }

  return [...championships.values()];
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
