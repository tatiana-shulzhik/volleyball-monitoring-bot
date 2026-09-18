import { MatchEntity } from '../databases/entities/match.entity';
import { PlayerTeamLeagueEntity } from '../databases/entities/player-team-league.entity';
import { ITeamStatistics } from '../interfaces/responses/team-statistics.interface';
import { SOURCE_BUTTONS } from '../modules/telegram/telegram.constants';
import {
  CEV_COUNTRIES,
  createMatchPageUrl,
  LEGA_VOLLEY_BASE_URL,
  LEGA_VOLLEY_FEMMINILE_STATISTICS_URL,
  MOSCOW_TIME_ZONE,
} from './consts/constants';
import { ESourceCode } from './enums';

export function getMoscowDayBounds(
  date = new Date(),
  dayOffset = 0,
): {
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
    start: new Date(Date.UTC(year, month - 1, day - 1 + dayOffset, 21)),
    end: new Date(Date.UTC(year, month - 1, day + dayOffset, 21)),
  };
}

export function formatTodayMatches(
  matches: MatchEntity[],
  sourceCode?: ESourceCode,
  dayOffset = 0,
): string {
  const period = dayOffset === 0 ? 'сегодня' : 'завтра';
  if (!matches.length) {
    const source = sourceCode
      ? `<p>📡 ${escapeHtml(SOURCE_BUTTONS[sourceCode])}</p>`
      : '';

    return `${source}<p><b>🔴 На ${period} запланированных матчей нет.</b></p>`;
  }

  const source = sourceCode
    ? `<p>📡 ${escapeHtml(SOURCE_BUTTONS[sourceCode])}</p>`
    : '';

  return [
    source,
    `<p><b>🔴 Матчи ${period}:</b></p>`,
    '<p>Выберите матч в нужном чемпионате:</p>',
  ].join('');
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

export function formatTodayMatchRoster(
  match: MatchEntity,
  homeRoster: PlayerTeamLeagueEntity[],
  awayRoster: PlayerTeamLeagueEntity[],
  homeStatistics: ITeamStatistics | null,
  awayStatistics: ITeamStatistics | null,
): string {
  const matchUrl = getMatchUrl(match);

  return [
    `<p><b>🏐 ${escapeHtml(match.homeTeam.name)} — ${escapeHtml(match.awayTeam.name)}</b></p>`,
    formatRosterTable(match.homeTeam.name, homeRoster, homeStatistics),
    formatRosterTable(match.awayTeam.name, awayRoster, awayStatistics),
    matchUrl
      ? `<p><a href="${escapeHtml(matchUrl)}">🔗 Открыть матч на сайте</a></p>`
      : '',
  ].join('\n\n');
}

function getMatchUrl(match: MatchEntity): string | null {
  const externalId = match.externalId;
  const sourceCode = match.league.stage.championship.source?.code;
  if (!externalId || !sourceCode) return null;

  if (sourceCode === ESourceCode.Cev) {
    return createMatchPageUrl(
      match.league.stage.championship.externalId,
      match.league.externalId,
      externalId,
    );
  }

  if (sourceCode === ESourceCode.LegaVolleyFemminile) {
    return `${LEGA_VOLLEY_FEMMINILE_STATISTICS_URL}${encodeURIComponent(externalId)}`;
  }

  return /^\d+$/.test(externalId)
    ? `${LEGA_VOLLEY_BASE_URL}/match/${encodeURIComponent(externalId)}`
    : null;
}

function formatRosterTable(
  teamName: string,
  roster: PlayerTeamLeagueEntity[],
  statistics: ITeamStatistics | null,
): string {
  const players = roster.map(({ player, shirtNumber, position }) => ({
    player,
    shirtNumber,
    position,
    statisticsPlayer: statistics?.players.find(
      (item) =>
        item.fullName === player.fullName &&
        (shirtNumber === null || item.shirtNumber === shirtNumber),
    ),
  }));
  const rows = players
    .sort(
      (left, right) =>
        (right.statisticsPlayer?.points ?? -1) -
          (left.statisticsPlayer?.points ?? -1) ||
        getPlayerRating(right.statisticsPlayer) -
          getPlayerRating(left.statisticsPlayer) ||
        left.player.fullName.localeCompare(right.player.fullName),
    )
    .map(({ player, shirtNumber, position, statisticsPlayer }) => {
      return [
        '<tr>',
        `<td align="center">${shirtNumber ?? '—'}</td>`,
        `<td>${escapeHtml(player.fullName)}</td>`,
        `<td align="center">${formatRating(statisticsPlayer)}</td>`,
        `<td align="center">${formatAttacks(statisticsPlayer)}</td>`,
        `<td align="center">${statisticsPlayer?.birthYear ?? '—'}</td>`,
        `<td align="center">${escapeHtml(statisticsPlayer?.position ?? position ?? '—')}</td>`,
        '</tr>',
      ].join('');
    });

  return [
    `<p><b>${escapeHtml(teamName)}</b></p>`,
    rows.length
      ? [
          '<table bordered striped>',
          '<tr><th>№</th><th>Игрок</th><th>Рейтинг (очки/сеты)</th><th>Атака (успешные/попытки)</th><th>Год рождения</th><th>Поз</th></tr>',
          ...rows,
          '</table>',
        ].join('')
      : '<p><i>Состав в базе не найден.</i></p>',
  ].join('\n');
}

function getPlayerRating(
  player: ITeamStatistics['players'][number] | undefined,
): number {
  return player?.points !== null && player?.setsPlayed
    ? player.points / player.setsPlayed
    : -1;
}

function formatRating(
  player: ITeamStatistics['players'][number] | undefined,
): string {
  if (
    !player ||
    player.points === null ||
    player.setsPlayed === null ||
    !player.setsPlayed
  ) {
    return '—';
  }

  return `${(player.points / player.setsPlayed).toFixed(2)} (${player.points}/${player.setsPlayed})`;
}

function formatAttacks(
  player: ITeamStatistics['players'][number] | undefined,
): string {
  if (
    !player ||
    player.attackAttempts === null ||
    player.successfulAttacks === null ||
    !player.attackAttempts
  ) {
    return '—';
  }

  return `${player.successfulAttacks}/${player.attackAttempts} (${(
    (player.successfulAttacks / player.attackAttempts) *
    100
  ).toFixed(0)}%)`;
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
