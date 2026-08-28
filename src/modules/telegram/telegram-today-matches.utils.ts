import { MatchEntity } from '../../databases/entities/match.entity';
import { MOSCOW_TIME_ZONE } from '../../shared/consts/constants';
import { ESourceCode } from '../../shared/enums';
import { SOURCE_BUTTONS } from './telegram.constants';

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

export function formatTodayMatches(matches: MatchEntity[]): string {
  if (!matches.length) {
    return '<p><b>🔴 На сегодня запланированных матчей нет.</b></p>';
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
      const title = `🏆 ${championship.name} · ${formatGender(match)}`;
      const group = byChampionship.get(title) ?? [];
      group.push(match);
      byChampionship.set(title, group);
    }

    const tournaments = [...byChampionship.entries()]
      .map(([title, tournamentMatches]) =>
        [
          `<p><b>${escapeHtml(title)}</b></p>`,
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

  return [`<p><b>🔴 Доступные матчи на сегодня:</b></p>`, ...sections].join('');
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

function formatGender(match: MatchEntity): string {
  const { name, source } = match.league.stage.championship;
  const normalized = name.toLocaleLowerCase();

  if (
    source?.code === ESourceCode.LegaVolleyFemminile ||
    /\b(women|female|femminile)\b/i.test(normalized)
  ) {
    return '♀ Женщины';
  }

  if (
    source?.code === ESourceCode.LegaVolley ||
    /\b(men|male|maschile)\b/i.test(normalized)
  ) {
    return '♂ Мужчины';
  }

  return 'Пол не указан';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
