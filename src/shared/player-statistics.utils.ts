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
        birthYear: relation.player.birthYear,
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
    seasonName: relations[0].league.stage.season?.name ?? '—',
    country: relations[0].team.country,
    championshipName: relations[0].league.stage.championship.name,
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

    return (
      '<tr>' +
      `<td align="center">${number}</td>` +
      `<td>${escapeHtml(player.fullName)}</td>` +
      `<td align="center">${statistics}</td>` +
      `<td align="center">${position}</td>` +
      `<td align="center">${attacks}</td>` +
      `<td align="center">${player.birthYear ?? '—'}</td>` +
      '</tr>'
    );
  });

  return [
    '<p><b>📊 Статистика команды</b></p>',
    `<p>📅 ${escapeHtml(data.seasonName)}</p>`,
    `<p>🌍 ${data.country ? escapeHtml(data.country) : '—'}</p>`,
    `<p>🏆 ${escapeHtml(data.championshipName)}</p>`,
    `<p>👥 ${escapeHtml(data.teamName)}</p>`,
    '<small><table bordered striped>',
    '<tr>' +
      '<th align="center">№</th>' +
      '<th align="center">Игрок</th>' +
      '<th align="center">Рейтинг<br>(очки/сеты)</th>' +
      '<th align="center">Поз</th>' +
      '<th align="center">Атака<br>(успешные/попытки)</th>' +
      '<th align="center">Год рождения</th>' +
      '</tr>',
    ...rows,
    '</table></small>',
  ].join('');
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
