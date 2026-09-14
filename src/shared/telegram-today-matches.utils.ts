import { MatchEntity } from '../databases/entities/match.entity';
import { SOURCE_BUTTONS } from '../modules/telegram/telegram.constants';
import { CEV_COUNTRIES, MOSCOW_TIME_ZONE } from './consts/constants';
import { ESourceCode } from './enums';

export function getMoscowDayBounds(date = new Date()): {
  start: Date;
  end: Date;
} {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOSCOW_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = value('year');
  const month = value('month');
  const day = value('day');

  return {
    start: new Date(Date.UTC(year, month - 1, day - 1, 21)),
    end: new Date(Date.UTC(year, month - 1, day, 21)),
  };
}

export function formatTodayMatches(
  matches: MatchEntity[],
  sourceCode?: ESourceCode,
): string {
  if (!matches.length) {
    const source = sourceCode
      ? `<p>📡 ${escapeHtml(SOURCE_BUTTONS[sourceCode])}</p>`
      : '';

    return `${source}<p><b>🔴 На сегодня запланированных матчей нет.</b></p>`;
  }

  const bySource = new Map<string, MatchEntity[]>();
  for (const match of matches) {
    const source = match.league.stage.championship.source;
    const sourceName = source
      ? (SOURCE_BUTTONS[source.code] ?? source.name)
      : 'Неизвестный источник';
    const group = bySource.get(sourceName) ?? [];
    group.push(match);
    bySource.set(sourceName, group);
  }

  const sections = [...bySource.entries()].map(([source, sourceMatches]) => {
    const byChampionship = new Map<string, MatchEntity[]>();
    for (const match of sourceMatches) {
      const championship = match.league.stage.championship;
      const group = byChampionship.get(championship.name) ?? [];
      group.push(match);
      byChampionship.set(championship.name, group);
    }

    const tournaments = [...byChampionship.entries()]
      .map(([title, tournamentMatches]) =>
        [
          `<p><b>🏆 ${escapeHtml(title)}</b></p>`,
          '<table bordered striped>',
          '<tr><th>Время</th><th>Команда 1</th><th>Команда 2</th></tr>',
          ...tournamentMatches.map(
            (match) =>
              '<tr>' +
              `<td align="center">${formatTime(match.scheduledAt)}</td>` +
              `<td>${escapeHtml(match.homeTeam.name)}</td>` +
              `<td>${escapeHtml(match.awayTeam.name)}</td>` +
              '</tr>',
          ),
          '</table>',
        ].join(''),
      )
      .join('');

    return `<p>📡 ${escapeHtml(source)}</p>${tournaments}`;
  });

  return [`<p><b>🔴 Матчи сегодня:</b></p>`, ...sections].join('');
}

export function formatTodayMatchButton(match: MatchEntity): string {
  const home = formatTeamCountry(match.homeTeam.country, match.homeTeam.name);
  const away = formatTeamCountry(match.awayTeam.country, match.awayTeam.name);
  const teams =
    home === away
      ? `${match.homeTeam.name} — ${match.awayTeam.name}`
      : `${home} — ${away}`;

  return truncateButtonText(`${formatTime(match.scheduledAt)} · ${teams}`);
}

function formatTime(value: Date | null): string {
  if (!value) return 'Время уточняется';

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: MOSCOW_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncateButtonText(value: string): string {
  const maxLength = 64;
  const characters = [...value];

  return characters.length <= maxLength
    ? value
    : `${characters.slice(0, maxLength - 1).join('')}…`;
}

function formatTeamCountry(country: string | null, fallback: string): string {
  return country ? (CEV_COUNTRIES[country] ?? country) : fallback;
}
