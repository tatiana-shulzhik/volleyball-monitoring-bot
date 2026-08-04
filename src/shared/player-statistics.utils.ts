import type { PlayerStatisticsEntity } from '../databases/entities/player-statistics.entity';
import type { PlayerTeamLeagueEntity } from '../databases/entities/player-team-league.entity';
import type { ITeamStatistics } from '../interfaces/responses/team-statistics.interface';
import { parseSeasonEndYear } from './season.utils';

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

  const statisticsByPlayerAndTournament = statistics.reduce(
    (result, item) => {
      const season = item.stage.season;

      if (!season) {
        return result;
      }

      const key = createStatisticsKey(
        item.player.id,
        item.stage.championship.id,
        item.team.name,
      );
      const stored = result.get(key) ?? {
        points: 0,
        setsPlayed: 0,
        attackAttempts: 0,
        successfulAttacks: 0,
        seasonNames: new Set<string>(),
      };

      stored.points += item.points;
      stored.setsPlayed += item.setsPlayed;
      stored.attackAttempts += item.attackAttempts;
      stored.successfulAttacks += item.successfulAttacks;
      stored.seasonNames.add(season.name);
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
        seasonNames: Set<string>;
      }
    >(),
  );
  const relationsByPlayerAndTournament = relations.reduce(
    (result, relation) => {
      const season = relation.league.stage.season;

      if (!season) {
        return result;
      }

      const key = createStatisticsKey(
        relation.player.id,
        relation.league.stage.championship.id,
        relation.team.name,
      );
      const stored = result.get(key);

      if (!stored) {
        result.set(key, { relation, seasonNames: new Set([season.name]) });
        return result;
      }

      stored.seasonNames.add(season.name);

      if (compareRelationsBySeason(relation, stored.relation) < 0) {
        stored.relation = relation;
      }

      return result;
    },
    new Map<
      string,
      { relation: PlayerTeamLeagueEntity; seasonNames: Set<string> }
    >(),
  );
  const players = [...relationsByPlayerAndTournament.entries()]
    .flatMap(([key, stored]) => {
      const { relation } = stored;
      const championship = relation.league.stage.championship;

      const playerStatistics = statisticsByPlayerAndTournament.get(key);
      const seasonNames = new Set([
        ...stored.seasonNames,
        ...(playerStatistics?.seasonNames ?? []),
      ]);

      return {
        fullName: relation.player.fullName,
        seasonName: formatSeasonNames(seasonNames),
        championshipName: championship.name,
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
        getLatestSeasonYear(right.seasonName) -
          getLatestSeasonYear(left.seasonName) ||
        left.championshipName.localeCompare(right.championshipName) ||
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
    data.teamSeasonName !== data.seasonName || seasons.length > 1
      ? formatRetroPlayers(data.players)
      : formatPlayersTable(data.players);

  return formatTeamStatisticsHeader(data) + statistics;
}

export function formatTeamStatisticsPages(
  data: ITeamStatistics,
  maxLength = 20000,
): string[] {
  const formatted = formatTeamStatistics(data);
  const seasons = new Set(data.players.map(({ seasonName }) => seasonName));

  if (
    formatted.length <= maxLength ||
    (data.teamSeasonName === data.seasonName && seasons.size < 2)
  ) {
    return [formatted];
  }

  const header = formatTeamStatisticsHeader(data);
  const groups = groupRetroPlayers(data.players);
  const pages: string[] = [];
  let pageGroups: ITeamStatistics['players'][] = [];

  for (const group of groups) {
    const candidateGroups = [...pageGroups, group];
    const candidate = header + formatRetroPlayerGroups(candidateGroups);

    if (candidate.length > maxLength && pageGroups.length) {
      pages.push(header + formatRetroPlayerGroups(pageGroups));
      pageGroups = [group];
    } else {
      pageGroups = candidateGroups;
    }
  }

  if (pageGroups.length) {
    pages.push(header + formatRetroPlayerGroups(pageGroups));
  }

  return pages;
}

function formatTeamStatisticsHeader(data: ITeamStatistics): string {
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
  ].join('');
}

function formatRetroPlayers(players: ITeamStatistics['players']): string {
  return formatRetroPlayerGroups(groupRetroPlayers(players));
}

function groupRetroPlayers(
  players: ITeamStatistics['players'],
): ITeamStatistics['players'][] {
  const playersByName = players.reduce((groups, player) => {
    const stored = groups.get(player.fullName) ?? [];
    stored.push(player);
    groups.set(player.fullName, stored);
    return groups;
  }, new Map<string, ITeamStatistics['players']>());

  return [...playersByName.values()].sort(compareRetroPlayerGroups);
}

function formatRetroPlayerGroups(groups: ITeamStatistics['players'][]): string {
  return groups
    .map((seasons) => {
      const latestSeasonYear = Math.max(
        ...seasons.map(({ seasonName }) => getLatestSeasonYear(seasonName)),
      );
      const latestSeason =
        seasons.find(
          ({ seasonName, shirtNumber }) =>
            getLatestSeasonYear(seasonName) === latestSeasonYear &&
            shirtNumber !== null,
        ) ??
        seasons.find(
          ({ seasonName }) =>
            getLatestSeasonYear(seasonName) === latestSeasonYear,
        );
      const rows = seasons.map(
        (season) =>
          '<tr>' +
          `<td>${escapeHtml(season.seasonName)}</td>` +
          `<td>${escapeHtml(season.championshipName)}</td>` +
          `<td>${escapeHtml(season.teamName)}</td>` +
          `<td align="center">${formatPlayerRating(season)}</td>` +
          `<td align="center">${formatPlayerAttacks(season)}</td>` +
          `<td align="center">${formatPlayerPosition(season.position)}</td>` +
          '</tr>',
      );

      return [
        '<br>',
        `<p>👤 №${latestSeason?.shirtNumber ?? '—'} `,
        `<b>${escapeHtml(seasons[0].fullName)}</b> · `,
        `${seasons[0].birthYear ?? '—'} г.р.</p>`,
        '<small><table bordered striped>',
        '<tr>' +
          '<th>Сезон</th>' +
          '<th>Турнир</th>' +
          '<th>Команда</th>' +
          '<th>Рейтинг<br>(очки/сеты)</th>' +
          '<th>Атака<br>(успешные/попытки)</th>' +
          '<th>Поз</th>' +
          '</tr>',
        ...rows,
        '</table></small>',
      ].join('');
    })
    .join('');
}

function compareRetroPlayerGroups(
  left: ITeamStatistics['players'],
  right: ITeamStatistics['players'],
): number {
  const leftSeason = getLatestPlayerSeason(left);
  const rightSeason = getLatestPlayerSeason(right);

  return (
    rightSeason.year - leftSeason.year ||
    (rightSeason.rating ?? -1) - (leftSeason.rating ?? -1) ||
    left[0].fullName.localeCompare(right[0].fullName)
  );
}

function getLatestPlayerSeason(players: ITeamStatistics['players']): {
  year: number;
  rating: number | null;
} {
  const latestYear = Math.max(
    ...players.map(({ seasonName }) => getLatestSeasonYear(seasonName)),
  );
  const ratings = players
    .filter(({ seasonName }) => getLatestSeasonYear(seasonName) === latestYear)
    .flatMap((player) => {
      const rating = calculatePlayerRating(player.points, player.setsPlayed);

      return rating === null ? [] : [rating];
    });

  return {
    year: latestYear,
    rating: ratings.length ? Math.max(...ratings) : null,
  };
}

function formatPlayersTable(players: ITeamStatistics['players']): string {
  const rows = players.map((player) => {
    const number = player.shirtNumber ?? '—';
    const position = formatPlayerPosition(player.position);

    return (
      '<tr>' +
      `<td align="center">${number}</td>` +
      `<td>${escapeHtml(player.fullName)}</td>` +
      `<td>${escapeHtml(player.championshipName)}</td>` +
      `<td align="center">${formatPlayerRating(player)}</td>` +
      `<td align="center">${formatPlayerAttacks(player)}</td>` +
      `<td align="center">${player.birthYear ?? '—'}</td>` +
      `<td align="center">${position}</td>` +
      '</tr>'
    );
  });

  return [
    '<small><table bordered striped>',
    '<tr>' +
      '<th align="center">№</th>' +
      '<th align="center">Игрок</th>' +
      '<th align="center">Турнир</th>' +
      '<th align="center">Рейтинг<br>(очки/сеты)</th>' +
      '<th align="center">Атака<br>(успешные/попытки)</th>' +
      '<th align="center">Год рождения</th>' +
      '<th align="center">Поз</th>' +
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
  championshipId: number,
  teamName: string,
): string {
  return `${playerId}:${championshipId}:${normalizeName(teamName)}`;
}

function formatSeasonNames(seasonNames: Iterable<string>): string {
  return [...new Set(seasonNames)]
    .sort(
      (left, right) => getLatestSeasonYear(right) - getLatestSeasonYear(left),
    )
    .join('–');
}

function getLatestSeasonYear(seasonName: string): number {
  return Math.max(
    ...seasonName.split('–').map((name) => parseSeasonEndYear(name) ?? 0),
  );
}

function compareRelationsBySeason(
  left: PlayerTeamLeagueEntity,
  right: PlayerTeamLeagueEntity,
): number {
  const seasonDifference =
    getLatestSeasonYear(right.league.stage.season?.name ?? '') -
    getLatestSeasonYear(left.league.stage.season?.name ?? '');

  return (
    seasonDifference ||
    Number(right.shirtNumber !== null) - Number(left.shirtNumber !== null)
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
