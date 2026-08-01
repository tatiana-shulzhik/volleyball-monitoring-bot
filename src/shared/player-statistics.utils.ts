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

  const statisticsByPlayerAndSeason = statistics.reduce(
    (result, item) => {
      const seasonId = item.stage.season?.id;

      if (!seasonId) {
        return result;
      }

      const key = createStatisticsKey(item.player.id, seasonId, item.team.id);
      const stored = result.get(key) ?? {
        points: 0,
        setsPlayed: 0,
        attackAttempts: 0,
        successfulAttacks: 0,
      };

      stored.points += item.points;
      stored.setsPlayed += item.setsPlayed;
      stored.attackAttempts += item.attackAttempts;
      stored.successfulAttacks += item.successfulAttacks;
      result.set(key, stored);
      return result;
    },
    new Map<
      string,
      {
        points: number;
        setsPlayed: number;
        attackAttempts: number;
        successfulAttacks: number;
      }
    >(),
  );
  const uniqueRelations = new Map(
    relations.flatMap((relation) => {
      const seasonId = relation.league.stage.season?.id;

      return seasonId
        ? [
            [
              createStatisticsKey(
                relation.player.id,
                seasonId,
                relation.team.id,
              ),
              relation,
            ] as const,
          ]
        : [];
    }),
  );
  const players = [...uniqueRelations.values()]
    .flatMap((relation) => {
      const season = relation.league.stage.season;

      if (!season) {
        return [];
      }

      const playerStatistics = statisticsByPlayerAndSeason.get(
        createStatisticsKey(relation.player.id, season.id, relation.team.id),
      );

      return {
        fullName: relation.player.fullName,
        seasonName: season.name,
        teamName: relation.team.name,
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
        left.fullName.localeCompare(right.fullName) ||
        right.seasonName.localeCompare(left.seasonName) ||
        left.teamName.localeCompare(right.teamName),
    );

  if (new Set(players.map(({ seasonName }) => seasonName)).size === 1) {
    players.sort(
      (left, right) =>
        (calculatePlayerRating(right.points, right.setsPlayed) ?? -1) -
          (calculatePlayerRating(left.points, left.setsPlayed) ?? -1) ||
        left.fullName.localeCompare(right.fullName),
    );
  }

  return {
    seasonName: relations[0].league.stage.season?.name ?? '—',
    teamSeasonName: relations[0].league.stage.season?.name ?? '—',
    country: relations[0].team.country,
    championshipName: relations[0].league.stage.championship.name,
    teamName: relations[0].team.name,
    leagueName: relations[0].league.name,
    players,
  };
}

export function formatTeamStatistics(data: ITeamStatistics): string {
  const seasons = [
    ...new Set(data.players.map(({ seasonName }) => seasonName)),
  ];
  const statistics =
    seasons.length > 1
      ? formatRetroPlayers(data.players)
      : formatPlayersTable(data.players);
  const teamSeason =
    data.teamSeasonName === data.seasonName
      ? ''
      : ` (${escapeHtml(data.teamSeasonName)})`;

  return [
    '<p><b>📊 Статистика команды</b></p>',
    `<p>📅 ${escapeHtml(data.seasonName)}</p>`,
    `<p>🌍 ${data.country ? escapeHtml(data.country) : '—'}</p>`,
    `<p>🏆 ${escapeHtml(data.championshipName)}</p>`,
    `<p>👥 ${escapeHtml(data.teamName)}${teamSeason}</p>`,
    statistics,
  ].join('');
}

function formatRetroPlayers(players: ITeamStatistics['players']): string {
  const playersByName = players.reduce((groups, player) => {
    const stored = groups.get(player.fullName) ?? [];
    stored.push(player);
    groups.set(player.fullName, stored);
    return groups;
  }, new Map<string, ITeamStatistics['players']>());

  return [...playersByName.values()]
    .map((seasons) => {
      const rows = seasons.map(
        (season) =>
          '<tr>' +
          `<td>${escapeHtml(season.seasonName)}</td>` +
          `<td>${escapeHtml(season.teamName)}</td>` +
          `<td align="center">${season.shirtNumber ?? '—'}</td>` +
          `<td align="center">${formatPlayerRating(season)}</td>` +
          `<td align="center">${formatPlayerPosition(season.position)}</td>` +
          `<td align="center">${formatPlayerAttacks(season)}</td>` +
          '</tr>',
      );

      return [
        '<br>',
        `<p>👤 <b>${escapeHtml(seasons[0].fullName)}</b> · `,
        `${seasons[0].birthYear ?? '—'} г.р.</p>`,
        '<small><table bordered striped>',
        '<tr>' +
          '<th>Сезон</th>' +
          '<th>Команда</th>' +
          '<th>№<br>игрока</th>' +
          '<th>Рейтинг<br>(очки/сеты)</th>' +
          '<th>Поз</th>' +
          '<th>Атака<br>(успешные/попытки)</th>' +
          '</tr>',
        ...rows,
        '</table></small>',
      ].join('');
    })
    .join('');
}

function formatPlayersTable(players: ITeamStatistics['players']): string {
  const rows = players.map((player) => {
    const number = player.shirtNumber ?? '—';
    const position = formatPlayerPosition(player.position);

    return (
      '<tr>' +
      `<td align="center">${number}</td>` +
      `<td>${escapeHtml(player.fullName)}</td>` +
      `<td align="center">${formatPlayerRating(player)}</td>` +
      `<td align="center">${position}</td>` +
      `<td align="center">${formatPlayerAttacks(player)}</td>` +
      `<td align="center">${player.birthYear ?? '—'}</td>` +
      '</tr>'
    );
  });

  return [
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

function formatPlayerRating(
  player: ITeamStatistics['players'][number],
): string {
  const rating = calculatePlayerRating(player.points, player.setsPlayed);

  return rating !== null && player.points !== null && player.setsPlayed !== null
    ? `${rating.toFixed(2)} (${player.points}/${player.setsPlayed})`
    : '—';
}

function formatPlayerAttacks(
  player: ITeamStatistics['players'][number],
): string {
  return player.attackAttempts !== null &&
    player.successfulAttacks !== null &&
    player.attackAttempts > 0
    ? `${player.successfulAttacks}/${player.attackAttempts} ` +
        `(${((player.successfulAttacks / player.attackAttempts) * 100).toFixed(0)}%)`
    : '—';
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

function createStatisticsKey(
  playerId: number,
  seasonId: number,
  teamId: number,
): string {
  return `${playerId}:${seasonId}:${teamId}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
