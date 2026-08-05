import type { PlayerStatisticsEntity } from '../databases/entities/player-statistics.entity';
import type { MatchPlayerAttackStatisticsEntity } from '../databases/entities/match-player-attack-statistics.entity';
import type { PlayerTeamLeagueEntity } from '../databases/entities/player-team-league.entity';
import type { IPlayerAttackStatisticsAggregate } from '../interfaces/responses/player-statistics.interface';
import type { ITeamStatistics } from '../interfaces/responses/team-statistics.interface';
import type {
  IFetchedMatchAttackStatistics,
  IPlayerRelationMaps,
  PlayerRelation,
} from '../interfaces/requests/player-statistics.interface';
import type { MatchEntity } from '../databases/entities/match.entity';
import { createCompetitionStageKey } from './competition-stages.utils';
import { CEV_COUNTRIES } from './consts/constants';
import { parseSeasonEndYear } from './season.utils';

export function normalizeName(value: string): string {
  return foldLatinText(value)
    .replace(/[^\p{Letter}\p{Number}]/gu, '')
    .toLowerCase();
}

export function normalizePlayerName(value: string): string {
  return (
    foldLatinText(value)
      .toLowerCase()
      .match(/[\p{Letter}\p{Number}]+/gu) ?? []
  )
    .sort((left, right) => left.localeCompare(right))
    .join('');
}

export function normalizeTeamName(value: string): string {
  const countryName = CEV_COUNTRIES[value.trim().toUpperCase()];

  return normalizeName(countryName ?? value);
}

function foldLatinText(value: string): string {
  const replacements: Record<string, string> = {
    æ: 'ae',
    đ: 'd',
    ð: 'd',
    ħ: 'h',
    ı: 'i',
    ł: 'l',
    ŋ: 'n',
    œ: 'oe',
    ø: 'o',
    ß: 'ss',
    þ: 'th',
    ŧ: 't',
  };

  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[æđðħıłŋœøßþŧ]/gu, (character) => replacements[character]);
}

export function createPlayerRelationKey(
  sourceExternalId: string | number,
  teamName: string,
  playerName: string,
): string {
  return (
    `${sourceExternalId}:` +
    `${normalizeTeamName(teamName)}:${normalizePlayerName(playerName)}`
  );
}

export function createPlayerTeamLeagueKey(
  playerId: number,
  teamId: number,
  leagueId: number,
): string {
  return `${playerId}:${teamId}:${leagueId}`;
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

export function uniqueMatchPlayerAttackStatistics(
  rows: Partial<MatchPlayerAttackStatisticsEntity>[],
): Partial<MatchPlayerAttackStatisticsEntity>[] {
  const unique = new Map<string, Partial<MatchPlayerAttackStatisticsEntity>>();

  for (const row of rows) {
    const matchId = row.match?.id;
    const playerId = row.player?.id;
    const teamId = row.team?.id;

    if (
      matchId === undefined ||
      playerId === undefined ||
      teamId === undefined
    ) {
      throw new Error('Match attack statistics relation id is missing');
    }

    const key = `${matchId}:${playerId}:${teamId}`;
    const stored = unique.get(key);

    if (
      !stored ||
      (row.attempts ?? 0) > (stored.attempts ?? 0) ||
      ((row.attempts ?? 0) === (stored.attempts ?? 0) &&
        (row.successful ?? 0) > (stored.successful ?? 0))
    ) {
      unique.set(key, row);
    }
  }

  return [...unique.values()];
}

export function buildRelationMaps(
  items: PlayerRelation[],
): IPlayerRelationMaps {
  const byExactPlayer = new Map<string, PlayerRelation>();

  for (const relation of items) {
    const sourceKey = createCompetitionStageKey(
      relation.league.stage.championship.externalId,
      relation.league.stage.externalId,
    );
    byExactPlayer.set(
      createPlayerRelationKey(
        sourceKey,
        relation.team.name,
        relation.player.fullName,
      ),
      relation,
    );
  }

  return { byExactPlayer };
}

export function findPlayerRelation(
  maps: IPlayerRelationMaps,
  sourceKey: string,
  teamName: string,
  playerName: string,
): PlayerRelation | undefined {
  return maps.byExactPlayer.get(
    createPlayerRelationKey(sourceKey, teamName, playerName),
  );
}

export function getMatchTeams(
  match: MatchEntity,
  attackStatistics: IFetchedMatchAttackStatistics,
) {
  return [
    { team: match.homeTeam, players: attackStatistics.home },
    { team: match.awayTeam, players: attackStatistics.away },
  ] as const;
}

export function createTeamStatistics(
  relations: PlayerTeamLeagueEntity[],
  statistics: PlayerStatisticsEntity[],
  attacks: IPlayerAttackStatisticsAggregate[],
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
        item.team.id,
      );
      const stored = result.get(key) ?? {
        points: 0,
        setsPlayed: 0,
        seasonNames: new Set<string>(),
      };

      stored.points += item.points;
      stored.setsPlayed += item.setsPlayed;
      stored.seasonNames.add(season.name);
      result.set(key, stored);
      return result;
    },
    new Map<
      string,
      {
        points: number;
        setsPlayed: number;
        seasonNames: Set<string>;
      }
    >(),
  );
  const attacksByPlayerAndTournament = new Map(
    attacks.map((item) => [
      createStatisticsKey(item.playerId, item.championshipId, item.teamId),
      item,
    ]),
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
        relation.team.id,
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
      const attackStatistics = attacksByPlayerAndTournament.get(key);
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
        attackAttempts: attackStatistics?.attempts ?? null,
        successfulAttacks: attackStatistics?.successful ?? null,
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
  teamId: number,
): string {
  return `${playerId}:${championshipId}:${teamId}`;
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
