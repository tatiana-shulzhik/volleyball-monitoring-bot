import { MatchEntity } from '../databases/entities/match.entity';
import {
  IMonitoredPlayer,
  IMonitoringContext,
  IPlayerMonitoringMessageData,
} from '../interfaces/responses/match-player-monitoring.interface';
import {
  ICevMatchLineupPlayer,
  ICevMatchRosterPlayer,
} from '../interfaces/requests/player-statistics.interface';
import { IMatchRosterMonitoringMessageData } from '../interfaces/requests/match-roster-monitoring.interface';
import { ILiveLineupMonitoringMessageData } from '../interfaces/requests/live-lineup-monitoring.interface';
import { IStartingLineupMonitoringMessageData } from '../interfaces/requests/starting-lineup-monitoring.interface';
import { EStartingLineupMonitoringStatus } from './enums';
import { LIVE_MONITORING_MAX_MATCH_AGE_HOURS } from './consts/constants';

export function getTeamData<T>(
  teamId: number,
  match: MatchEntity,
  home: T,
  away: T,
): T | undefined {
  if (teamId === match.homeTeam.id) return home;
  if (teamId === match.awayTeam.id) return away;

  return undefined;
}

export function getMonitoredPlayers<T>(
  match: MatchEntity,
  context: IMonitoringContext,
  home: T,
  away: T,
): IMonitoredPlayer<T>[] {
  const subscriptions = context.subscriptionsByChampionship.get(
    match.league.stage.championship.id,
  );
  if (!subscriptions) return [];

  return subscriptions.flatMap((subscription) => {
    const relation = context.relationsByPlayerAndLeague.get(
      `${subscription.playerId}:${match.league.id}`,
    );
    if (!relation) return [];

    const teamData = getTeamData(relation.team.id, match, home, away);
    return teamData ? [{ subscription, relation, teamData }] : [];
  });
}

export function addRosterPositions(
  roster: ICevMatchRosterPlayer[],
  teamId: number,
  context: IMonitoringContext,
): ICevMatchRosterPlayer[] {
  return roster.map((player) => ({
    ...player,
    position:
      context.positionsByTeamAndPlayer.get(`${teamId}:${player.externalId}`) ??
      player.position,
  }));
}

/** Формирует ключ Redis для состояния игрока в матче. */
export function getPlayerMonitoringStateKey(
  match: MatchEntity,
  playerId: number,
): string {
  return `match-monitoring:${match.id}:player:${playerId}`;
}

/** Возвращает TTL состояния до окончания допустимого live-окна матча. */
export function getPlayerMonitoringStateTtl(
  match: MatchEntity,
  now: Date,
): number {
  const expiresAt =
    (match.scheduledAt?.getTime() ?? now.getTime()) +
    LIVE_MONITORING_MAX_MATCH_AGE_HOURS * 3_600_000;

  return Math.max(1, Math.ceil((expiresAt - now.getTime()) / 1_000));
}

export function findLineupPlayer(
  players: ICevMatchLineupPlayer[],
  playerName: string,
  shirtNumber: number | null,
): ICevMatchLineupPlayer | undefined {
  if (shirtNumber !== null) {
    const byShirtNumber = players.find(
      (player) => player.shirtNumber === shirtNumber,
    );
    if (byShirtNumber) return byShirtNumber;
  }

  const normalizedName = normalizePlayerName(playerName);
  return players.find(
    (player) => normalizePlayerName(player.playerName) === normalizedName,
  );
}

export function isStarter(mark: string | undefined): boolean {
  return Boolean(mark && (/^[1-6]$/.test(mark) || mark === '*'));
}

export function isActiveMark(mark: string): boolean {
  return mark !== '' && mark !== '-';
}

export function getCurrentSet(
  home: ICevMatchLineupPlayer[],
  away: ICevMatchLineupPlayer[],
): number | null {
  let currentSet = 0;
  for (const player of [...home, ...away]) {
    for (const [index, mark] of player.setMarks.entries()) {
      if (isActiveMark(mark)) currentSet = Math.max(currentSet, index + 1);
    }
  }
  return currentSet || null;
}

export function formatMatchRosterMonitoringMessage(
  data: IMatchRosterMonitoringMessageData,
): string {
  const timeUntilMatch = data.scheduledAt
    ? formatTimeUntilMatch(data.scheduledAt, data.checkedAt)
    : 'время матча уточняется';

  return [
    '<p><b>🏐 Заявка на матч</b></p>',
    `<p><b>${escapeHtml(data.homeTeamName)} — ${escapeHtml(data.awayTeamName)}</b></p>`,
    `<p>Проверка: за ${escapeHtml(timeUntilMatch)} до начала</p>`,
    formatMatchRosterTable(data.homeTeamName, data.home),
    formatMatchRosterTable(data.awayTeamName, data.away),
  ].join('');
}

function formatMatchRosterTable(
  teamName: string,
  roster: ICevMatchRosterPlayer[],
): string {
  const rows = [...roster]
    .sort(
      (left, right) =>
        (left.shirtNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.shirtNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.playerName.localeCompare(right.playerName),
    )
    .map(
      (player) =>
        '<tr>' +
        `<td align="center">${player.shirtNumber ?? '—'}</td>` +
        `<td>${escapeHtml(player.playerName)}</td>` +
        `<td align="center">${escapeHtml(player.position ?? '—')}</td>` +
        '</tr>',
    );

  return [
    `<p><b>🟢 ${escapeHtml(teamName)}</b></p>`,
    rows.length
      ? [
          '<table bordered striped>',
          '<tr><th>№</th><th>Игрок</th><th>Поз.</th></tr>',
          ...rows,
          '</table>',
        ].join('')
      : '<p><i>Заявка пока не опубликована.</i></p>',
  ].join('');
}

export function formatStartingLineupMessage(
  data: IPlayerMonitoringMessageData & {
    status: EStartingLineupMonitoringStatus;
  },
): string {
  return formatMonitoringMessage(
    data.status === EStartingLineupMonitoringStatus.Starter
      ? '🟢 Игрок заявлен в стартовый состав'
      : '🪑 Игрок на скамейке',
    data,
    'Стартовый состав (за 10 минут до начала)',
  );
}

export function formatStartingLineupMonitoringMessage(
  data: IStartingLineupMonitoringMessageData,
): string {
  return [
    '<p><b>🏐 Стартовый состав</b></p>',
    `<p><b>${escapeHtml(data.homeTeamName)} — ${escapeHtml(data.awayTeamName)}</b></p>`,
    formatStartingLineupTable(
      data.homeTeamName,
      data.home,
      data.homePositionsByShirtNumber,
    ),
    formatStartingLineupTable(
      data.awayTeamName,
      data.away,
      data.awayPositionsByShirtNumber,
    ),
    data.matchProtocolUrl
      ? `<p><a href="${escapeHtml(data.matchProtocolUrl)}">📄 Протокол матча</a></p>`
      : '',
  ].join('');
}

function formatStartingLineupTable(
  teamName: string,
  lineup: ICevMatchLineupPlayer[],
  positionsByShirtNumber: Map<number, string>,
): string {
  const rows = [...lineup]
    .sort(
      (left, right) =>
        (left.shirtNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.shirtNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.playerName.localeCompare(right.playerName),
    )
    .map((player) => {
      const position =
        player.shirtNumber === null
          ? '—'
          : (positionsByShirtNumber.get(player.shirtNumber) ?? '—');
      const status = formatLineupStatus(player.setMarks[0]);

      return (
        '<tr>' +
        `<td align="center">${player.shirtNumber ?? '—'}</td>` +
        `<td>${escapeHtml(player.playerName)}</td>` +
        `<td align="center">${escapeHtml(position)}</td>` +
        `<td align="center">${status}</td>` +
        '</tr>'
      );
    });

  return [
    `<p><b>🟢 ${escapeHtml(teamName)}</b></p>`,
    '<table bordered striped>',
    '<tr><th>№</th><th>Игрок</th><th>Поз.</th><th>Статус</th></tr>',
    ...rows,
    '</table>',
  ].join('');
}

export function formatLiveMonitoringMessage(
  data: ILiveLineupMonitoringMessageData,
): string {
  return [
    `<p><b>🔄 Состав в текущем сете (${data.currentSet})</b></p>`,
    `<p><b>${escapeHtml(data.homeTeamName)} — ${escapeHtml(data.awayTeamName)}</b></p>`,
    formatLiveLineupTable(
      data.homeTeamName,
      data.home,
      data.homePositionsByShirtNumber,
      data.currentSet,
    ),
    formatLiveLineupTable(
      data.awayTeamName,
      data.away,
      data.awayPositionsByShirtNumber,
      data.currentSet,
    ),
    data.matchProtocolUrl
      ? `<p><a href="${escapeHtml(data.matchProtocolUrl)}">📄 Протокол матча</a></p>`
      : '',
  ].join('');
}

function formatLiveLineupTable(
  teamName: string,
  lineup: ICevMatchLineupPlayer[],
  positionsByShirtNumber: Map<number, string>,
  currentSet: number,
): string {
  const rows = [...lineup]
    .sort(
      (left, right) =>
        (left.shirtNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.shirtNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.playerName.localeCompare(right.playerName),
    )
    .map((player) => {
      const mark = player.setMarks[currentSet - 1] ?? '';
      const status = formatLineupStatus(mark);
      const position =
        player.shirtNumber === null
          ? '—'
          : (positionsByShirtNumber.get(player.shirtNumber) ?? '—');

      return (
        '<tr>' +
        `<td align="center">${player.shirtNumber ?? '—'}</td>` +
        `<td>${escapeHtml(player.playerName)}</td>` +
        `<td align="center">${escapeHtml(position)}</td>` +
        `<td align="center">${status}</td>` +
        '</tr>'
      );
    });

  return [
    `<p><b>🟢 ${escapeHtml(teamName)}</b></p>`,
    '<table bordered striped>',
    '<tr><th>№</th><th>Игрок</th><th>Поз.</th><th>Статус</th></tr>',
    ...rows,
    '</table>',
  ].join('');
}

function formatLineupStatus(mark: string | undefined): string {
  if (!isActiveMark(mark ?? '')) return '🪑';

  return mark === '*' ? '🟢 ⭐' : '🟢';
}

function normalizePlayerName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
}

function formatMonitoringMessage(
  title: string,
  data: IPlayerMonitoringMessageData,
  check: string,
): string {
  return [
    title,
    '',
    'Игрок:',
    formatPlayerDetails(data),
    '',
    'Команда:',
    data.teamName,
    '',
    'Матч:',
    `${data.homeTeamName} vs ${data.awayTeamName}`,
    '',
    'Проверка:',
    check,
  ].join('\n');
}

function formatPlayerDetails(data: IPlayerMonitoringMessageData): string {
  return [
    data.shirtNumber === null ? undefined : `№ ${data.shirtNumber}`,
    data.playerName,
    data.position ? `(${data.position})` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
}

function formatTimeUntilMatch(scheduledAt: Date, checkedAt: Date): string {
  const minutes = Math.max(
    0,
    Math.floor((scheduledAt.getTime() - checkedAt.getTime()) / 60_000),
  );
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return hours
    ? `${hours} ч. ${remainingMinutes} мин.`
    : `${remainingMinutes} мин.`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
