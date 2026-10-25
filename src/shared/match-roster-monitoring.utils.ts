import { createHash } from 'node:crypto';
import { MatchEntity } from '../databases/entities/match.entity';
import {
  IMonitoredPlayer,
  IMonitoringContext,
  IPlayerMonitoringMessageData,
} from '../interfaces/responses/match-player-monitoring.interface';
import {
  ICevMatchLineupPlayer,
  ICevPlayerAttackStatistics,
  ICevMatchRosterPlayer,
  IFetchedMatchLineup,
  IFetchedMatchRoster,
} from '../interfaces/requests/player-statistics.interface';
import { IMatchRosterMonitoringMessageData } from '../interfaces/requests/match-roster-monitoring.interface';
import {
  ILiveLineupChangeGroup,
  ILiveLineupChangeItem,
  ILiveLineupMonitoringMessageData,
} from '../interfaces/requests/live-lineup-monitoring.interface';
import {
  IAbsentStartingLineupPlayer,
  IStartingLineupMonitoringMessageData,
} from '../interfaces/requests/starting-lineup-monitoring.interface';
import { EStartingLineupMonitoringStatus } from './enums';
import { LIVE_MONITORING_MAX_MATCH_AGE_HOURS } from './consts/constants';
import {
  formatPlayerPosition,
  normalizePlayerName as normalizeStatisticsPlayerName,
} from './player-statistics.utils';
import type { ITeamPlayerStatistics } from '../interfaces/responses/team-statistics.interface';

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

/** Подставляет externalId из состава команды, если в заявке его нет (Lega Volley Femminile). */
export function resolveMatchRosterExternalIds(
  roster: ICevMatchRosterPlayer[],
  teamId: number,
  leagueId: number,
  context: IMonitoringContext,
): ICevMatchRosterPlayer[] {
  const relations = [...context.relationsByPlayerAndLeague.values()].filter(
    (relation) =>
      relation.team.id === teamId && relation.league.id === leagueId,
  );

  return roster.map((player) => {
    if (player.externalId) return player;

    const byShirtNumber =
      player.shirtNumber === null
        ? undefined
        : relations.find(
            (relation) => relation.shirtNumber === player.shirtNumber,
          );
    const byName = relations.find(
      (relation) =>
        normalizePlayerName(relation.player.fullName) ===
        normalizePlayerName(player.playerName),
    );
    const relation = byShirtNumber ?? byName;
    if (!relation) return player;

    return {
      ...player,
      externalId: relation.player.externalId,
      position: player.position ?? relation.position ?? undefined,
    };
  });
}

export function addRosterStatistics(
  roster: ICevMatchRosterPlayer[],
  statistics: ITeamPlayerStatistics[] | undefined,
): ICevMatchRosterPlayer[] {
  if (!statistics) return roster;

  const statisticsByName = new Map<string, ITeamPlayerStatistics[]>();
  for (const item of statistics) {
    const name = normalizeStatisticsPlayerName(item.fullName);
    const items = statisticsByName.get(name) ?? [];
    items.push(item);
    statisticsByName.set(name, items);
  }

  return roster.map((player) => {
    const matched = statisticsByName
      .get(normalizeStatisticsPlayerName(player.playerName))
      ?.find(
        (item) =>
          player.shirtNumber === null ||
          item.shirtNumber === null ||
          item.shirtNumber === player.shirtNumber,
      );

    return matched
      ? {
          ...player,
          statistics: {
            points: matched.points,
            setsPlayed: matched.setsPlayed,
            attackAttempts: matched.attackAttempts,
            successfulAttacks: matched.successfulAttacks,
          },
        }
      : player;
  });
}

export function getMonitoredRoster(
  monitored: IMonitoredPlayer<ICevMatchRosterPlayer[]>[],
  teamId: number,
  statistics: ITeamPlayerStatistics[] | undefined,
): ICevMatchRosterPlayer[] {
  const roster = monitored
    .filter(({ relation }) => relation.team.id === teamId)
    .map(({ subscription, relation, teamData }) => {
      const player = findRosterPlayer(
        teamData,
        subscription.player.fullName,
        subscription.player.externalId,
        relation.shirtNumber,
      );

      return (
        player ?? {
          externalId: subscription.player.externalId,
          playerName: subscription.player.fullName,
          shirtNumber: relation.shirtNumber,
          position: relation.position ?? undefined,
          isInRoster: false,
        }
      );
    });

  return addRosterStatistics(roster, statistics);
}

export function getAbsentStartingLineupPlayers(
  monitored: IMonitoredPlayer<ICevMatchLineupPlayer[]>[],
  teamId: number,
  positionsByShirtNumber: Map<number, string>,
): IAbsentStartingLineupPlayer[] {
  return monitored.flatMap(({ subscription, relation, teamData }) => {
    if (relation.team.id !== teamId) return [];

    const player = findLineupPlayer(
      teamData,
      subscription.player.fullName,
      relation.shirtNumber,
    );
    if (player && isStarter(player.setMarks[0])) return [];

    const shirtNumber = player?.shirtNumber ?? relation.shirtNumber;
    const position =
      (shirtNumber === null
        ? undefined
        : positionsByShirtNumber.get(shirtNumber)) ??
      relation.position ??
      undefined;

    return [
      {
        playerName: player?.playerName ?? subscription.player.fullName,
        shirtNumber,
        position,
      },
    ];
  });
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

export function getMonitoredLineupPlayers(
  monitoredPlayers: IMonitoredPlayer<ICevMatchLineupPlayer[]>[],
  teamId: number,
  lineup: ICevMatchLineupPlayer[],
): ICevMatchLineupPlayer[] {
  return monitoredPlayers.flatMap(({ subscription, relation }) => {
    if (relation.team.id !== teamId) return [];
    const player = findLineupPlayer(
      lineup,
      subscription.player.fullName,
      relation.shirtNumber,
    );
    return player ? [player] : [];
  });
}

export function getLineupChanges(
  teamName: string,
  previous: ICevMatchLineupPlayer[],
  previousSet: number,
  current: ICevMatchLineupPlayer[],
  currentSet: number,
): ILiveLineupChangeGroup | null {
  const key = (player: ICevMatchLineupPlayer) =>
    `${player.shirtNumber}:${player.playerName}`;
  const previousActive = previous.filter((player) =>
    isActiveMark(player.setMarks[previousSet - 1] ?? ''),
  );
  const currentActive = current.filter((player) =>
    isActiveMark(player.setMarks[currentSet - 1] ?? ''),
  );
  const previousKeys = new Set(previousActive.map(key));
  const currentKeys = new Set(currentActive.map(key));
  const outgoing = previousActive.filter(
    (player) => !currentKeys.has(key(player)),
  );
  const incoming = currentActive.filter(
    (player) => !previousKeys.has(key(player)),
  );

  const toItem = (
    kind: ILiveLineupChangeItem['kind'],
    player: ICevMatchLineupPlayer,
  ): ILiveLineupChangeItem => ({
    kind,
    player: {
      shirtNumber: player.shirtNumber,
      playerName: player.playerName,
    },
  });
  const items = [
    ...outgoing.map((player) => toItem('out', player)),
    ...incoming.map((player) => toItem('in', player)),
  ];
  if (!items.length) return null;

  return { teamName, items };
}

export function getPositionsByShirtNumber(
  teamId: number,
  leagueId: number,
  context: IMonitoringContext,
): Map<number, string> {
  return new Map(
    [...context.relationsByPlayerAndLeague.values()].flatMap((relation) =>
      relation.team.id === teamId &&
      relation.league.id === leagueId &&
      relation.shirtNumber !== null &&
      relation.position
        ? [[relation.shirtNumber, relation.position] as const]
        : [],
    ),
  );
}

export function getRosterNotificationKey(
  match: MatchEntity,
  roster: Pick<IFetchedMatchRoster, 'home' | 'away'>,
  newAbsenteePlayerIds: number[],
): string {
  const rosterSignature = [roster.home, roster.away]
    .map((team) =>
      [...team]
        .sort(
          (left, right) =>
            left.externalId.localeCompare(right.externalId) ||
            (left.shirtNumber ?? -1) - (right.shirtNumber ?? -1) ||
            (left.position ?? '').localeCompare(right.position ?? ''),
        )
        .map(
          ({ externalId, shirtNumber, position }) =>
            `${externalId}:${shirtNumber ?? ''}:${position ?? ''}`,
        )
        .join(','),
    )
    .join('|');
  const absenteesSignature = [...newAbsenteePlayerIds]
    .sort((left, right) => left - right)
    .join(',');
  const digest = createHash('sha256')
    .update(`${rosterSignature}|absentees:${absenteesSignature}`)
    .digest('hex');

  return `match-monitoring:${match.id}:roster-notification:${digest}`;
}

/** Ключ дедупа: Active только среди отслеживаемых. */
export function getLiveNotificationKey(
  match: MatchEntity,
  lineup: Pick<IFetchedMatchLineup, 'home' | 'away'>,
  currentSet: number,
): string {
  const signature = [lineup.home, lineup.away]
    .map((team) =>
      [...team]
        .filter((player) => isActiveMark(player.setMarks[currentSet - 1] ?? ''))
        .sort(
          (left, right) =>
            (left.shirtNumber ?? -1) - (right.shirtNumber ?? -1) ||
            left.playerName.localeCompare(right.playerName),
        )
        .map(
          ({ playerName, shirtNumber }) => `${playerName}:${shirtNumber ?? ''}`,
        )
        .join(','),
    )
    .join('|');
  const digest = createHash('sha256').update(signature).digest('hex');

  return `match-monitoring:${match.id}:live-notification:${currentSet}:${digest}`;
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

export function findRosterPlayer(
  players: ICevMatchRosterPlayer[],
  playerName: string,
  externalId: string,
  shirtNumber: number | null,
): ICevMatchRosterPlayer | undefined {
  if (externalId) {
    const byExternalId = players.find(
      (player) => player.externalId === externalId,
    );
    if (byExternalId) return byExternalId;
  }

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

/** Для Femminile дописывает прошлые позиции из Redis к текущему сету. */
export function mergeLineupSetMarksHistory(
  previous: ICevMatchLineupPlayer[] | undefined,
  current: ICevMatchLineupPlayer[],
  currentSet: number,
): ICevMatchLineupPlayer[] {
  const safeSetCount = Math.max(1, currentSet);
  const previousByKey = new Map(
    (previous ?? []).map((player) => [createLineupPlayerKey(player), player]),
  );

  return current.map((player) => {
    const previousPlayer = previousByKey.get(createLineupPlayerKey(player));
    const setMarks = Array.from({ length: safeSetCount }, (_, index) => {
      if (index === safeSetCount - 1) {
        return player.setMarks[index] ?? player.setMarks.at(-1) ?? '-';
      }
      const currentMark = player.setMarks[index] ?? '';
      if (isActiveMark(currentMark)) return currentMark;
      return previousPlayer?.setMarks[index] || currentMark || '-';
    });

    return { ...player, setMarks };
  });
}

function createLineupPlayerKey(player: ICevMatchLineupPlayer): string {
  return `${player.shirtNumber ?? ''}:${normalizePlayerName(player.playerName)}`;
}

export function formatMatchRosterMonitoringMessage(
  data: IMatchRosterMonitoringMessageData,
): string {
  const timeUntilMatch = data.scheduledAt
    ? formatTimeUntilMatch(data.scheduledAt, data.checkedAt)
    : 'время матча уточняется';
  const absentHome = data.monitoredHome.filter(
    (player) => player.isInRoster === false,
  );
  const absentAway = data.monitoredAway.filter(
    (player) => player.isInRoster === false,
  );
  const hasAbsentees = absentHome.length > 0 || absentAway.length > 0;

  return [
    '<p><b>🏐 Заявка на матч</b></p>',
    formatCompetitionHeader(data),
    `<p><b>${escapeHtml(data.homeTeamName)} — ${escapeHtml(data.awayTeamName)}</b></p>`,
    `<p>Проверка: за ${escapeHtml(timeUntilMatch)} до начала</p>`,
    hasAbsentees
      ? [
          '<p><b>🔴 Отсутствуют из мониторинга</b></p>',
          absentHome.length
            ? formatMatchRosterTable(data.homeTeamName, absentHome, {
                accent: 'absent',
              })
            : '',
          absentAway.length
            ? formatMatchRosterTable(data.awayTeamName, absentAway, {
                accent: 'absent',
              })
            : '',
        ].join('')
      : '<p><b>🟢 Все отслеживаемые в заявке</b></p>',
    '<p><b>Отслеживаемые игроки</b></p>',
    data.monitoredHome.length
      ? formatMatchRosterTable(data.homeTeamName, data.monitoredHome)
      : '',
    data.monitoredAway.length
      ? formatMatchRosterTable(data.awayTeamName, data.monitoredAway)
      : '',
  ].join('');
}

export function formatFullMatchRosterMonitoringMessage(
  data: IMatchRosterMonitoringMessageData,
): string {
  return [
    '<p><b>🏐 Заявка на матч</b></p>',
    formatCompetitionHeader(data),
    `<p><b>${escapeHtml(data.homeTeamName)} — ${escapeHtml(data.awayTeamName)}</b></p>`,
    '<p><b>Расклад на матч</b></p>',
    formatMatchRosterTable(data.homeTeamName, data.home, {
      showStatus: false,
    }),
    formatMatchRosterTable(data.awayTeamName, data.away, {
      showStatus: false,
    }),
  ].join('');
}

function formatMatchRosterTable(
  teamName: string,
  roster: ICevMatchRosterPlayer[],
  options?: { accent?: 'present' | 'absent'; showStatus?: boolean },
): string {
  const accent = options?.accent ?? 'present';
  const showStatus = options?.showStatus ?? true;
  const rows = [...roster]
    .sort(
      (left, right) =>
        (left.shirtNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.shirtNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.playerName.localeCompare(right.playerName),
    )
    .map((player) => {
      const cells = [
        `<td align="center">${player.shirtNumber ?? '—'}</td>`,
        `<td>${escapeHtml(player.playerName)}</td>`,
      ];
      if (showStatus) {
        cells.push(
          `<td align="center">${player.isInRoster === false ? '🔴' : '🟢'}</td>`,
        );
      }
      cells.push(
        `<td align="center">${formatRosterPlayerRating(player)}</td>`,
        `<td align="center">${formatRosterPlayerAttacks(player)}</td>`,
        `<td align="center">${formatPlayerPosition(player.position)}</td>`,
      );

      return `<tr>${cells.join('')}</tr>`;
    });

  const headerEmoji = accent === 'absent' ? '🔴' : '🟢';
  const headers = [
    '<th>№</th>',
    '<th>Игрок</th>',
    ...(showStatus ? ['<th>Статус</th>'] : []),
    '<th>Рейтинг (о/с)</th>',
    '<th>Атака (у/п)</th>',
    '<th>Поз</th>',
  ];

  return [
    `<p><b>${headerEmoji} ${escapeHtml(teamName)}</b></p>`,
    rows.length
      ? [
          '<table bordered striped>',
          `<tr>${headers.join('')}</tr>`,
          ...rows,
          '</table>',
        ].join('')
      : '<p><i>Заявка пока не опубликована.</i></p>',
  ].join('');
}

function formatRosterPlayerRating(player: ICevMatchRosterPlayer): string {
  const statistics = player.statistics;
  if (
    statistics?.points === null ||
    statistics?.points === undefined ||
    !statistics.setsPlayed
  ) {
    return '—';
  }

  return `${(statistics.points / statistics.setsPlayed).toFixed(2)} (${statistics.points}/${statistics.setsPlayed})`;
}

function formatRosterPlayerAttacks(player: ICevMatchRosterPlayer): string {
  const statistics = player.statistics;
  if (!statistics?.attackAttempts || statistics.successfulAttacks === null) {
    return '—';
  }

  return `${statistics.successfulAttacks}/${statistics.attackAttempts} (${(
    (statistics.successfulAttacks / statistics.attackAttempts) *
    100
  ).toFixed(0)}%)`;
}

export function formatStartingLineupMessage(
  data: IPlayerMonitoringMessageData & {
    status: EStartingLineupMonitoringStatus;
  },
): string {
  return formatMonitoringMessage(
    data.status === EStartingLineupMonitoringStatus.Starter
      ? '🟢 Игрок заявлен в стартовый состав'
      : 'Игрок не в стартовом составе',
    data,
    'Стартовый состав (за 10 минут до начала)',
  );
}

export function formatStartingLineupMonitoringMessage(
  data: IStartingLineupMonitoringMessageData,
): string {
  return [
    '<p><b>🏐 Стартовый состав</b></p>',
    formatCompetitionHeader(data),
    `<p><b>${escapeHtml(data.homeTeamName)} — ${escapeHtml(data.awayTeamName)}</b></p>`,
    '<p><b>🔴 Отсутствуют из стартового состава</b></p>',
    data.absentHome.length
      ? formatAbsentStartingLineupTable(data.homeTeamName, data.absentHome)
      : '',
    data.absentAway.length
      ? formatAbsentStartingLineupTable(data.awayTeamName, data.absentAway)
      : '',
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

function formatAbsentStartingLineupTable(
  teamName: string,
  lineup: IAbsentStartingLineupPlayer[],
): string {
  const rows = [...lineup]
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
        `<td align="center">${formatPlayerPosition(player.position)}</td>` +
        '</tr>',
    );

  return [
    `<p><b>🔴 ${escapeHtml(teamName)}</b></p>`,
    '<table bordered striped>',
    '<tr><th>№</th><th>Игрок</th><th>Поз</th></tr>',
    ...rows,
    '</table>',
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
      const status = formatSetLineupMark(player.setMarks[0]);

      return (
        '<tr>' +
        `<td align="center">${player.shirtNumber ?? '—'}</td>` +
        `<td>${escapeHtml(player.playerName)}</td>` +
        `<td align="center">${formatPlayerPosition(position)}</td>` +
        `<td align="center">${status}</td>` +
        '</tr>'
      );
    });

  return [
    `<p><b>🟢 ${escapeHtml(teamName)}</b></p>`,
    '<table bordered striped>',
    '<tr><th>№</th><th>Игрок</th><th>Поз</th><th>Статус</th></tr>',
    ...rows,
    '</table>',
  ].join('');
}

export function formatLiveMonitoringMessage(
  data: ILiveLineupMonitoringMessageData,
): string {
  const changes = formatLiveChanges(data);

  return [
    `<p><b>🔄 Состав по сетам (1–${data.currentSet})</b></p>`,
    formatCompetitionHeader(data),
    `<p><b>${escapeHtml(data.homeTeamName)} — ${escapeHtml(data.awayTeamName)}</b></p>`,
    changes ? `<br>${changes}<br>` : '',
    formatLiveLineupTable(
      data.homeTeamName,
      data.home,
      data.homeAttackStatistics,
      data.homePositionsByShirtNumber,
      data.currentSet,
    ),
    '<br>',
    formatLiveLineupTable(
      data.awayTeamName,
      data.away,
      data.awayAttackStatistics,
      data.awayPositionsByShirtNumber,
      data.currentSet,
    ),
    data.matchProtocolUrl
      ? `<br><p><a href="${escapeHtml(data.matchProtocolUrl)}">📄 Протокол матча</a></p>`
      : '',
  ].join('');
}

function formatLiveChanges(data: ILiveLineupMonitoringMessageData): string {
  if (!data.changes?.length) return '';

  const groups = data.changes.map((group) => {
    const isHome = group.teamName === data.homeTeamName;
    const lineup = isHome ? data.home : data.away;
    const attackStatistics = isHome
      ? data.homeAttackStatistics
      : data.awayAttackStatistics;
    const positionsByShirtNumber = isHome
      ? data.homePositionsByShirtNumber
      : data.awayPositionsByShirtNumber;

    return [
      `<p><b>🔁 ${escapeHtml(group.teamName)}</b></p>`,
      ...group.items.map((item) => {
        const marker = item.kind === 'out' ? '🔴' : '🟢';
        const player = findLineupPlayer(
          lineup,
          item.player.playerName,
          item.player.shirtNumber,
        ) ?? {
          playerName: item.player.playerName,
          shirtNumber: item.player.shirtNumber,
          setMarks: [],
        };
        const statistics = findLivePlayerStatistics(player, attackStatistics);
        const position =
          player.shirtNumber === null
            ? '—'
            : formatPlayerPosition(
                positionsByShirtNumber.get(player.shirtNumber) ?? '—',
              );

        return (
          `<p><b>${marker} №${item.player.shirtNumber ?? '—'} ` +
          `${escapeHtml(item.player.playerName)} (${position})</b><br>` +
          `⭐ ${formatLivePlayerRating(statistics)} · ` +
          `⚡ ${formatLivePlayerAttacks(statistics)}</p>`
        );
      }),
    ].join('');
  });

  return ['<p><b>🔔 ИЗМЕНЕНИЕ СОСТАВА</b></p>', ...groups].join('<br>');
}

function formatLiveLineupTable(
  teamName: string,
  lineup: ICevMatchLineupPlayer[],
  attackStatistics: ICevPlayerAttackStatistics[] | undefined,
  positionsByShirtNumber: Map<number, string>,
  currentSet: number,
): string {
  if (!lineup.length) return '';

  const setHeaders = Array.from(
    { length: currentSet },
    (_, index) => `<th>С${index + 1}</th>`,
  );
  const rows = lineup
    .map((player) => ({
      player,
      statistics: findLivePlayerStatistics(player, attackStatistics),
    }))
    .sort(
      (left, right) =>
        (right.statistics?.points ?? -1) - (left.statistics?.points ?? -1) ||
        (left.player.shirtNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.player.shirtNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.player.playerName.localeCompare(right.player.playerName),
    )
    .map(({ player, statistics }) => {
      const statuses = Array.from(
        { length: currentSet },
        (_, index) =>
          `<td align="center">${formatSetLineupMark(player.setMarks[index])}</td>`,
      );
      const position =
        player.shirtNumber === null
          ? '—'
          : (positionsByShirtNumber.get(player.shirtNumber) ?? '—');

      return (
        '<tr>' +
        `<td align="center">${player.shirtNumber ?? '—'}</td>` +
        `<td>${escapeHtml(player.playerName)}</td>` +
        statuses.join('') +
        `<td align="center">${formatLivePlayerRating(statistics)}</td>` +
        `<td align="center">${formatLivePlayerAttacks(statistics)}</td>` +
        `<td align="center">${formatPlayerPosition(position)}</td>` +
        '</tr>'
      );
    });

  return [
    `<p><b>🟢 ${escapeHtml(teamName)}</b></p>`,
    '<table bordered striped>',
    '<tr><th>№</th><th>Игрок</th>' +
      setHeaders.join('') +
      '<th>Рейтинг (о/с)</th>' +
      '<th>Атака (у/п)</th>' +
      '<th>Поз</th></tr>',
    ...rows,
    '</table>',
  ].join('');
}

function findLivePlayerStatistics(
  player: ICevMatchLineupPlayer,
  statistics: ICevPlayerAttackStatistics[] | undefined,
): ICevPlayerAttackStatistics | undefined {
  if (!statistics) return undefined;

  return statistics.find(
    (item) =>
      (player.shirtNumber === null ||
        item.shirtNumber === player.shirtNumber) &&
      normalizePlayerName(item.playerName) ===
        normalizePlayerName(player.playerName),
  );
}

function formatLivePlayerRating(
  statistics: ICevPlayerAttackStatistics | undefined,
): string {
  if (!statistics?.setsPlayed) return '—';

  return `${(statistics.points / statistics.setsPlayed).toFixed(2)} (${statistics.points}/${statistics.setsPlayed})`;
}

function formatLivePlayerAttacks(
  statistics: ICevPlayerAttackStatistics | undefined,
): string {
  if (!statistics) return '—';

  // Femminile live отдаёт только результативные атаки, без попыток.
  if (!statistics.attempts) {
    return statistics.successful > 0 ? `${statistics.successful}/—` : '—';
  }

  return `${statistics.successful}/${statistics.attempts} (${(
    (statistics.successful / statistics.attempts) *
    100
  ).toFixed(0)}%)`;
}

function formatSetLineupMark(mark: string | undefined): string {
  return isActiveMark(mark ?? '') ? escapeHtml(mark!) : '—';
}

function normalizePlayerName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[^a-z0-9]/gi, '')
    .toUpperCase();
}

function formatCompetitionHeader(data: {
  championshipName: string;
  stageName: string;
  leagueName: string;
}): string {
  const details = [data.stageName, data.leagueName]
    .map((name) => name.trim())
    .filter(Boolean)
    .filter(
      (name, index, names) =>
        name !== data.championshipName && names.indexOf(name) === index,
    );

  return [
    '<br>',
    `<p>🏆 ${escapeHtml(data.championshipName)}</p>`,
    details.length
      ? `<p>📌 ${details.map((name) => escapeHtml(name)).join(' · ')}</p>`
      : '',
    '<br>',
  ].join('');
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
