import { MatchEntity } from '../databases/entities/match.entity';
import { PlayerTeamLeagueEntity } from '../databases/entities/player-team-league.entity';
import { ICevMatchRosterPlayer } from '../interfaces/requests/player-statistics.interface';
import { MatchRosterDisplaySource } from '../interfaces/responses/match-roster-display.interface';
import {
  ITeamPlayerStatistics,
  ITeamStatistics,
} from '../interfaces/responses/team-statistics.interface';
import { SOURCE_BUTTONS } from '../modules/telegram/telegram.constants';
import {
  createMatchPageUrl,
  LEGA_VOLLEY_BASE_URL,
  LEGA_VOLLEY_FEMMINILE_STATISTICS_URL,
  MOSCOW_TIME_ZONE,
} from './consts/constants';
import { ESourceCode } from './enums';
import { normalizePlayerName } from './player-statistics.utils';

export function toDisplayRoster(
  roster: PlayerTeamLeagueEntity[],
): ICevMatchRosterPlayer[] {
  return roster.map(({ player, shirtNumber, position }) => ({
    externalId: player.externalId,
    playerName: player.fullName,
    shirtNumber,
    position: position ?? undefined,
  }));
}

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
  return truncateButtonText(
    `${formatTime(match.scheduledAt)} · ${match.homeTeam.name} — ${match.awayTeam.name}`,
  );
}

export function formatTodayMatchRoster(
  match: MatchEntity,
  homeRoster: ICevMatchRosterPlayer[],
  awayRoster: ICevMatchRosterPlayer[],
  homeStatistics: ITeamStatistics | null,
  awayStatistics: ITeamStatistics | null,
  source: MatchRosterDisplaySource = 'database',
  matchUrl: string | null = null,
): string {
  const emptyMessage =
    source === 'site'
      ? 'Заявка пока не опубликована.'
      : 'Состав в базе не найден.';
  const resolvedMatchUrl = matchUrl ?? getMatchUrl(match);

  return [
    `<p><b>🏐 ${escapeHtml(match.homeTeam.name)} — ${escapeHtml(match.awayTeam.name)}</b></p>`,
    resolvedMatchUrl
      ? `<p><a href="${escapeHtml(resolvedMatchUrl)}">🔗 Открыть матч на сайте</a></p>`
      : '',
    formatRosterTable(
      match.homeTeam.name,
      homeRoster,
      homeStatistics,
      emptyMessage,
    ),
    formatRosterTable(
      match.awayTeam.name,
      awayRoster,
      awayStatistics,
      emptyMessage,
    ),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function getMatchUrl(
  match: MatchEntity,
  siteMatchId?: string | null,
): string | null {
  const externalId = match.externalId;
  const sourceCode = match.league.stage.championship.source?.code;
  if (!sourceCode) return null;

  if (sourceCode === ESourceCode.Cev) {
    if (!externalId) return null;
    return createMatchPageUrl(
      match.league.stage.championship.externalId,
      match.league.externalId,
      externalId,
    );
  }

  if (sourceCode === ESourceCode.LegaVolleyFemminile) {
    const sourceMatchId =
      siteMatchId ?? externalId?.match(/(\d+)$/)?.[1] ?? null;
    if (!sourceMatchId) return null;
    return `${LEGA_VOLLEY_FEMMINILE_STATISTICS_URL}${encodeURIComponent(sourceMatchId)}`;
  }

  if (sourceCode !== ESourceCode.LegaVolley) return null;

  const sourceMatchId =
    siteMatchId ?? (externalId && /^\d+$/.test(externalId) ? externalId : null);
  if (!sourceMatchId) return null;

  return `${LEGA_VOLLEY_BASE_URL}/match/${encodeURIComponent(sourceMatchId)}`;
}

function formatRosterTable(
  teamName: string,
  roster: ICevMatchRosterPlayer[],
  statistics: ITeamStatistics | null,
  emptyMessage: string,
): string {
  const rows = [...roster]
    .sort(
      (left, right) =>
        (left.shirtNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.shirtNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.playerName.localeCompare(right.playerName),
    )
    .map((player) => {
      const statisticsPlayer = findStatisticsPlayer(player, statistics);
      return [
        '<tr>',
        `<td align="center">${player.shirtNumber ?? '—'}</td>`,
        `<td>${escapeHtml(player.playerName)}</td>`,
        `<td align="center">${formatRating(player, statisticsPlayer)}</td>`,
        `<td align="center">${formatAttacks(player, statisticsPlayer)}</td>`,
        `<td align="center">${statisticsPlayer?.birthYear ?? '—'}</td>`,
        `<td align="center">${escapeHtml(
          statisticsPlayer?.position ?? player.position ?? '—',
        )}</td>`,
        '</tr>',
      ].join('');
    });

  return [
    `<p><b>${escapeHtml(teamName)}</b></p>`,
    rows.length
      ? [
          '<table bordered striped>',
          '<tr><th>№</th><th>Игрок</th><th>Рейтинг (о/с)</th><th>Атака (у/п)</th><th>Год рождения</th><th>Поз</th></tr>',
          ...rows,
          '</table>',
        ].join('')
      : `<p><i>${escapeHtml(emptyMessage)}</i></p>`,
  ].join('\n');
}

function findStatisticsPlayer(
  player: ICevMatchRosterPlayer,
  statistics: ITeamStatistics | null,
): ITeamPlayerStatistics | undefined {
  if (!statistics) return undefined;

  const name = normalizePlayerName(player.playerName);
  return statistics.players.find(
    (item) =>
      normalizePlayerName(item.fullName) === name &&
      (player.shirtNumber === null ||
        item.shirtNumber === null ||
        item.shirtNumber === player.shirtNumber),
  );
}

function formatRating(
  player: ICevMatchRosterPlayer,
  statisticsPlayer: ITeamPlayerStatistics | undefined,
): string {
  const points = player.statistics?.points ?? statisticsPlayer?.points ?? null;
  const setsPlayed =
    player.statistics?.setsPlayed ?? statisticsPlayer?.setsPlayed ?? null;
  if (points === null || setsPlayed === null || !setsPlayed) {
    return '—';
  }

  return `${(points / setsPlayed).toFixed(2)} (${points}/${setsPlayed})`;
}

function formatAttacks(
  player: ICevMatchRosterPlayer,
  statisticsPlayer: ITeamPlayerStatistics | undefined,
): string {
  const attackAttempts =
    player.statistics?.attackAttempts ??
    statisticsPlayer?.attackAttempts ??
    null;
  const successfulAttacks =
    player.statistics?.successfulAttacks ??
    statisticsPlayer?.successfulAttacks ??
    null;
  if (
    attackAttempts === null ||
    successfulAttacks === null ||
    !attackAttempts
  ) {
    return '—';
  }

  return `${successfulAttacks}/${attackAttempts} (${(
    (successfulAttacks / attackAttempts) *
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
