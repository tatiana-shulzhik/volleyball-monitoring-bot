import type { PlayerStatisticsEntity } from '../databases/entities/player-statistics.entity';
import type { PlayerTeamLeagueEntity } from '../databases/entities/player-team-league.entity';
import type { ITeamStatistics } from '../interfaces/responses/team-statistics.interface';

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]/gu, '')
    .toLowerCase();
}

export function createPlayerRelationKey(
  sourceExternalId: string | number,
  teamName: string,
  playerName: string,
): string {
  return (
    `${sourceExternalId}:` +
    `${normalizeName(teamName)}:${normalizeName(playerName)}`
  );
}

export function calculatePlayerRating(
  points: number | null,
  setsPlayed: number | null,
): number | null {
  return points !== null && setsPlayed ? points / setsPlayed : null;
}

export function uniquePlayerStatistics(
  rows: Partial<PlayerStatisticsEntity>[],
): Partial<PlayerStatisticsEntity>[] {
  return [
    ...new Map(
      rows.map((row) => [
        `${row.stage?.id}:${row.team?.id}:${row.player?.id}`,
        row,
      ]),
    ).values(),
  ];
}

export function createTeamStatistics(
  relations: PlayerTeamLeagueEntity[],
  statistics: PlayerStatisticsEntity[],
): ITeamStatistics | null {
  if (!relations.length) {
    return null;
  }

  const statisticsByPlayerId = statistics.reduce(
    (result, item) => {
      const stored = result.get(item.player.id) ?? {
        points: 0,
        setsPlayed: 0,
        attackAttempts: 0,
        successfulAttacks: 0,
      };

      stored.points += item.points;
      stored.setsPlayed += item.setsPlayed;
      stored.attackAttempts += item.attackAttempts;
      stored.successfulAttacks += item.successfulAttacks;
      result.set(item.player.id, stored);
      return result;
    },
    new Map<
      number,
      {
        points: number;
        setsPlayed: number;
        attackAttempts: number;
        successfulAttacks: number;
      }
    >(),
  );
  const players = relations
    .map((relation) => {
      const playerStatistics = statisticsByPlayerId.get(relation.player.id);

      return {
        fullName: relation.player.fullName,
        shirtNumber: relation.shirtNumber,
        position: relation.position,
        points: playerStatistics?.points ?? null,
        setsPlayed: playerStatistics?.setsPlayed ?? null,
        attackAttempts: playerStatistics?.attackAttempts ?? null,
        successfulAttacks: playerStatistics?.successfulAttacks ?? null,
      };
    })
    .sort(
      (left, right) =>
        (calculatePlayerRating(right.points, right.setsPlayed) ?? -1) -
          (calculatePlayerRating(left.points, left.setsPlayed) ?? -1) ||
        left.fullName.localeCompare(right.fullName),
    );

  return {
    teamName: relations[0].team.name,
    leagueName: relations[0].league.name,
    players,
  };
}

export function formatTeamStatistics(data: ITeamStatistics): string {
  const rows = data.players.map((player) => {
    const number = player.shirtNumber ?? '—';
    const position = formatPlayerPosition(player.position);
    const rating = calculatePlayerRating(player.points, player.setsPlayed);
    const statistics =
      rating !== null && player.points !== null && player.setsPlayed !== null
        ? `${rating.toFixed(2)} (${player.points}/${player.setsPlayed})`
        : '—';
    const attacks =
      player.attackAttempts !== null &&
      player.successfulAttacks !== null &&
      player.attackAttempts > 0
        ? `${player.successfulAttacks}/${player.attackAttempts} ` +
          `(${((player.successfulAttacks / player.attackAttempts) * 100).toFixed(0)}%)`
        : '—';

    return [
      String(number).padStart(2),
      truncate(player.fullName, 22).padEnd(22),
      truncate(position, 3).padEnd(3),
      statistics.padEnd(18),
      attacks,
    ].join(' ');
  });

  const table = [
    ' № Игрок                  Поз Рейтинг (очки/сеты) Атака (успешные/попытки)',
    '──────────────────────────────────────────────────────────────────────────',
    ...rows,
  ].join('\n');

  return [
    `<b>🏐 ${escapeHtml(data.teamName)}</b>`,
    `🏆 ${escapeHtml(data.leagueName)}`,
    `<pre>${escapeHtml(table)}</pre>`,
  ].join('\n\n');
}

function formatPlayerPosition(position: string | null): string {
  if (!position) {
    return '—';
  }

  const normalizedPosition = position.trim().toLowerCase();
  const positionLabels: Record<string, string> = {
    'outside spiker': 'WS',
    opposite: 'O',
    'middle blocker': 'MB',
    setter: 'S',
    libero: 'L',
  };

  return positionLabels[normalizedPosition] ?? escapeHtml(position);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function truncate(value: string, maxLength: number): string {
  const characters = [...value];

  if (characters.length <= maxLength) {
    return value;
  }

  return `${characters.slice(0, maxLength - 1).join('')}…`;
}
