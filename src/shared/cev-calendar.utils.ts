import { ICevChampionship } from '../interfaces/requests/championships.interface';
import { ICevCompetitionStage } from '../interfaces/requests/competition-stages.interface';
import { createPostbackForm } from './aspnet-form.utils';
import { createCompetitionStageKey } from './competition-stages.utils';
import { ECompetitionType } from './enums';
import { getCompetitionSeasonName } from './season.utils';

const PERIOD_CONTROL = 'ctl00$Content_Left$RCB_Period';
const PERIOD_CLIENT_STATE = 'ctl00_Content_Left_RCB_Period_ClientState';
const VOLLEY_TYPE_CONTROL = 'ctl00$Content_Left$RTS_VolleyType';
const VOLLEY_TYPE_CLIENT_STATE =
  'ctl00_Content_Left_RTS_VolleyType_ClientState';
const HIDDEN_VOLLEY_TYPE = 'ctl00$Content_Left$HiddenType';

export function getCalendarMetadata(html: string) {
  const availableYears = [
    ...html.matchAll(/<li class="rcbItem">(\d{4})<\/li>/g),
  ].map((match) => Number(match[1]));
  const selectedYear = html.match(
    /"_text":"(\d{4})","_uniqueId":"ctl00\$Content_Left\$RCB_Period"/,
  )?.[1];

  if (!selectedYear) {
    throw new Error('Unable to determine selected CEV calendar year');
  }

  return {
    availableYears,
    selectedYear: Number(selectedYear),
  };
}

export function createCalendarForm(
  html: string,
  year: number,
): URLSearchParams {
  const form = createPostbackForm(html);
  form.set('__EVENTTARGET', PERIOD_CONTROL);
  form.set('__EVENTARGUMENT', '');
  form.set(
    PERIOD_CLIENT_STATE,
    JSON.stringify({
      logEntries: [],
      value: String(year),
      text: String(year),
      enabled: true,
      checkedIndices: [],
      checkedItemsTextOverflows: false,
    }),
  );

  return form;
}

export function createNationalTeamCalendarForm(html: string): URLSearchParams {
  const form = createPostbackForm(html);

  form.set('__EVENTTARGET', VOLLEY_TYPE_CONTROL);
  form.set('__EVENTARGUMENT', '1');
  form.set(HIDDEN_VOLLEY_TYPE, '3');
  form.set(
    VOLLEY_TYPE_CLIENT_STATE,
    JSON.stringify({ selectedIndexes: ['1'], logEntries: [] }),
  );

  return form;
}

export function extractCalendarChampionships(
  html: string,
  competitionType: ECompetitionType,
  calendarYear: number,
): { championships: ICevChampionship[]; stages: ICevCompetitionStage[] } {
  const championships = new Map<number, ICevChampionship>();
  const stages = new Map<string, ICevCompetitionStage>();
  const rowRegex = /<tr\b[^>]*class=['"]rlv[IA]['"][^>]*>([\s\S]*?)<\/tr>/gi;
  const linkRegex =
    /<a\b(?=[^>]*href=['"][^'"]*competition\.aspx\?ID=(\d+)(?:&amp;|&)PID=(\d+)[^'"]*['"])[^>]*>([\s\S]*?)<\/a>/gi;

  for (const row of html.matchAll(rowRegex)) {
    const links = [...row[1].matchAll(linkRegex)];
    const dateRange = cleanText(links[0]?.[3] ?? '').match(
      /^(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})$/,
    );
    const match = links.find((link) =>
      /\b20\d{2}\s*\|/.test(cleanText(link[3])),
    );

    if (!match || !dateRange) {
      continue;
    }

    const externalId = Number(match[1]);
    const stageExternalId = Number(match[2]);
    const text = cleanText(match[3]);
    const competition = text.match(
      /^(.*?\b(20\d{2})\s*\|\s*(?:Men|Women))(?:\s*-\s*(.*))?$/i,
    );

    if (!competition || stageExternalId < 0) {
      continue;
    }

    const startsAt = parseCevDate(dateRange[1], false);
    const endsAt = parseCevDate(dateRange[2], true);
    const competitionYear = Number(competition[2]);
    const seasonReferenceYear =
      competitionType === ECompetitionType.Club
        ? competitionYear
        : calendarYear;
    const stageKey = createCompetitionStageKey(externalId, stageExternalId);
    const existingStage = stages.get(stageKey);

    championships.set(externalId, {
      externalId,
      name: competition[1].trim(),
      competitionType,
    });
    stages.set(stageKey, {
      externalId: stageExternalId,
      name: competition[3]?.trim() || competition[1].trim(),
      championshipExternalId: externalId,
      seasonName: getCompetitionSeasonName(
        competitionType,
        seasonReferenceYear,
      ),
      startsAt:
        existingStage && existingStage.startsAt! < startsAt
          ? existingStage.startsAt
          : startsAt,
      endsAt:
        existingStage && existingStage.endsAt! > endsAt
          ? existingStage.endsAt
          : endsAt,
    });
  }

  return {
    championships: [...championships.values()],
    stages: [...stages.values()],
  };
}

function parseCevDate(value: string, endOfDay: boolean): Date {
  const [day, month, year] = value.split('/').map(Number);

  return new Date(
    Date.UTC(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
    ),
  );
}

function cleanText(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ');
}
