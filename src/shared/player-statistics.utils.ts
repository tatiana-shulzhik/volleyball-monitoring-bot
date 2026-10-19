import type { MatchPlayerAttackStatisticsEntity } from '../databases/entities/match-player-attack-statistics.entity';
import type { PlayerTeamLeagueEntity } from '../databases/entities/player-team-league.entity';
import type { IPlayerAttackStatisticsAggregate } from '../interfaces/responses/player-statistics.interface';
import type { IPlayerPointsAggregate } from '../interfaces/responses/player-statistics.interface';
import type { ITeamStatistics } from '../interfaces/responses/team-statistics.interface';
import type {
  IFetchedMatchAttackStatistics,
  IPlayerRelationMaps,
  PlayerRelation,
} from '../interfaces/requests/player-statistics.interface';
import type { MatchEntity } from '../databases/entities/match.entity';
import { createCompetitionStageKey } from './competition-stages.utils';
import {
  CEV_COUNTRIES,
  PLAYER_POSITION_SHORT_LABELS,
} from './consts/constants';
import { ESourceCode } from './enums';
import { parseSeasonEndYear } from './season.utils';

export function sumNullable(
  left: number | null,
  right: number | null,
): number | null {
  return left === null || right === null ? null : left + right;
}

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
  const byTeamAndShirtNumber = new Map<string, PlayerRelation>();

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
    if (relation.shirtNumber !== null) {
      byTeamAndShirtNumber.set(
        createTeamShirtNumberKey(
          sourceKey,
          relation.team.name,
          relation.shirtNumber,
        ),
        relation,
      );
    }
  }

  return { byExactPlayer, byTeamAndShirtNumber };
}

export function findPlayerRelation(
  maps: IPlayerRelationMaps,
  sourceKey: string,
  teamName: string,
  playerName: string,
  shirtNumber?: number | null,
): PlayerRelation | undefined {
  const byName = maps.byExactPlayer.get(
    createPlayerRelationKey(sourceKey, teamName, playerName),
  );

  return (
    byName ??
    (shirtNumber === null || shirtNumber === undefined
      ? undefined
      : maps.byTeamAndShirtNumber.get(
          createTeamShirtNumberKey(sourceKey, teamName, shirtNumber),
        ))
  );
}

function createTeamShirtNumberKey(
  sourceKey: string,
  teamName: string,
  shirtNumber: number,
): string {
  return `${sourceKey}:${normalizeTeamName(teamName)}:${shirtNumber}`;
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
  attacks: Array<IPlayerAttackStatisticsAggregate | IPlayerPointsAggregate>,
  sourceCode = ESourceCode.Cev,
): ITeamStatistics | null {
  if (!relations.length) {
    return null;
  }

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

      const attackStatistics = attacksByPlayerAndTournament.get(key);

      return {
        fullName: relation.player.fullName,
        seasonName: formatSeasonNames(stored.seasonNames),
        championshipName: championship.name,
        teamName: relation.team.name,
        birthYear: relation.player.birthYear,
        shirtNumber: relation.shirtNumber,
        position: relation.position,
        points: attackStatistics?.points ?? null,
        setsPlayed:
          attackStatistics && 'setsPlayed' in attackStatistics
            ? attackStatistics.setsPlayed
            : null,
        attackAttempts:
          attackStatistics && 'attempts' in attackStatistics
            ? attackStatistics.attempts
            : null,
        successfulAttacks:
          attackStatistics && 'successful' in attackStatistics
            ? attackStatistics.successful
            : null,
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
        (right.points ?? -1) - (left.points ?? -1) ||
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
    sourceCode,
    players,
  };
}

export function formatTeamStatistics(
  data: ITeamStatistics,
  expanded = false,
): string {
  const seasons = [
    ...new Set(data.players.map(({ seasonName }) => seasonName)),
  ];
  const statistics =
    expanded || data.teamSeasonName !== data.seasonName || seasons.length > 1
      ? formatRetroPlayers(data.players)
      : formatPlayersTable(
          data.players,
          data.championshipName === 'Все чемпионаты',
        );

  return formatTeamStatisticsHeader(data) + statistics;
}

export function formatTeamStatisticsPages(
  data: ITeamStatistics,
  maxLength = 12000,
  expanded = false,
): string[] {
  const formatted = formatTeamStatistics(data, expanded);
  const seasons = new Set(data.players.map(({ seasonName }) => seasonName));

  if (
    formatted.length <= maxLength ||
    (!expanded && data.teamSeasonName === data.seasonName && seasons.size < 2)
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
  const rosterLegend = data.players.some(({ rosterChange }) => rosterChange)
    ? '<p>🟢 новый · 🔴 ушёл · 🔵 остался · ⚪ нет данных</p>'
    : '';

  return [
    '<p><b>📊 Статистика команды</b></p>',
    `<p>🔗 ${formatStatisticsSource(data.sourceCode)}</p>`,
    `<p>📅 ${escapeHtml(data.seasonName)}</p>`,
    `<p>🌍 ${data.country ? escapeHtml(data.country) : '—'}</p>`,
    `<p>🏆 ${escapeHtml(data.championshipName)}</p>`,
    `<p>👥 ${escapeHtml(data.teamName)}${teamSeason}</p>`,
    rosterLegend,
  ].join('');
}

function formatStatisticsSource(sourceCode: ESourceCode): string {
  const sources: Record<ESourceCode, string> = {
    [ESourceCode.Cev]: '🇪🇺 CEV',
    [ESourceCode.LegaVolley]: '🇮🇹 Lega Volley',
    [ESourceCode.LegaVolleyFemminile]: '🇮🇹 Lega Volley Femminile',
  };

  return sources[sourceCode];
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

  return [...playersByName.values()].sort((left, right) => {
    const leftChange = getRosterChange(left);
    const rightChange = getRosterChange(right);

    if (leftChange || rightChange) {
      const priority: Record<NonNullable<typeof leftChange>, number> = {
        new: 0,
        stayed: 1,
        left: 2,
        unknown: 3,
      };
      const difference =
        priority[leftChange ?? 'unknown'] - priority[rightChange ?? 'unknown'];

      if (difference) return difference;
    }

    return compareRetroPlayerGroups(left, right);
  });
}

function formatRetroPlayerGroups(groups: ITeamStatistics['players'][]): string {
  return groups
    .map((seasons, index) => {
      const rosterChange = getRosterChange(seasons);
      const previousRosterChange = index
        ? getRosterChange(groups[index - 1])
        : undefined;
      const sectionHeader =
        rosterChange && rosterChange !== previousRosterChange
          ? formatRosterSectionHeader(rosterChange)
          : '';
      const sortedSeasons = [...seasons].sort(
        (left, right) =>
          getLatestSeasonYear(right.seasonName) -
            getLatestSeasonYear(left.seasonName) ||
          (right.points ?? -1) - (left.points ?? -1) ||
          (calculatePlayerRating(right.points, right.setsPlayed) ?? -1) -
            (calculatePlayerRating(left.points, left.setsPlayed) ?? -1),
      );
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
      const rosterIndicator = getRosterIndicator(getRosterChange(seasons));
      const rows = sortedSeasons.map(
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
        sectionHeader,
        `<p>👤 №${latestSeason?.shirtNumber ?? '—'} `,
        `${rosterIndicator}<b>${escapeHtml(seasons[0].fullName)}</b> · `,
        `${seasons[0].birthYear ?? '—'} г.р.</p>`,
        '<table bordered striped>',
        '<tr>' +
          '<th>Сезон</th>' +
          '<th>Турнир</th>' +
          '<th>Команда</th>' +
          '<th>Рейтинг (очки/сеты)</th>' +
          '<th>Атака (успешные/попытки)</th>' +
          '<th>Поз</th>' +
          '</tr>',
        ...rows,
        '</table>',
      ].join('');
    })
    .join('');
}

function getRosterChange(
  players: ITeamStatistics['players'],
): ITeamStatistics['players'][number]['rosterChange'] {
  return players.find(({ rosterChange }) => rosterChange)?.rosterChange;
}

function formatRosterSectionHeader(
  change: NonNullable<ITeamStatistics['players'][number]['rosterChange']>,
): string {
  const labels: Record<typeof change, string> = {
    new: '🟢 Новые игроки',
    stayed: '🔵 Актуальный состав',
    left: '🔴 Покинули команду',
    unknown: '⚪ Нет данных для сравнения',
  };

  return `<p><b>${labels[change]}</b></p>`;
}

function getRosterIndicator(
  change: ITeamStatistics['players'][number]['rosterChange'],
): string {
  return change === 'new'
    ? '🟢 '
    : change === 'left'
      ? '🔴 '
      : change === 'stayed'
        ? '🔵 '
        : change === 'unknown'
          ? '⚪ '
          : '';
}

function compareRetroPlayerGroups(
  left: ITeamStatistics['players'],
  right: ITeamStatistics['players'],
): number {
  const leftSeason = getLatestPlayerSeason(left);
  const rightSeason = getLatestPlayerSeason(right);

  return (
    rightSeason.year - leftSeason.year ||
    (rightSeason.points ?? -1) - (leftSeason.points ?? -1) ||
    (rightSeason.rating ?? -1) - (leftSeason.rating ?? -1) ||
    left[0].fullName.localeCompare(right[0].fullName)
  );
}

function getLatestPlayerSeason(players: ITeamStatistics['players']): {
  year: number;
  rating: number | null;
  points: number | null;
} {
  const years = [
    ...new Set(
      players.map(({ seasonName }) => getLatestSeasonYear(seasonName)),
    ),
  ].sort((left, right) => right - left);

  for (const year of years) {
    const seasonPlayers = players.filter(
      ({ seasonName }) => getLatestSeasonYear(seasonName) === year,
    );
    const ratings = seasonPlayers.flatMap((player) => {
      const rating = calculatePlayerRating(player.points, player.setsPlayed);

      return rating === null ? [] : [rating];
    });
    const points = seasonPlayers.flatMap((player) =>
      player.points === null ? [] : [player.points],
    );

    // A season with points but without played sets has no displayed rating
    // and must not affect the retro players sorting.
    if (ratings.length) {
      return {
        year,
        rating: ratings.length ? Math.max(...ratings) : null,
        points: points.length
          ? points.reduce((total, value) => total + value, 0)
          : null,
      };
    }
  }

  return { year: years[0] ?? 0, rating: null, points: null };
}

function formatPlayersTable(
  players: ITeamStatistics['players'],
  aggregateChampionships = false,
): string {
  const displayedPlayers = aggregateChampionships
    ? aggregateCurrentSeasonStatistics(players)
    : players;
  const rows = displayedPlayers.map((player) => {
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
    '<table bordered striped>',
    '<tr>' +
      '<th align="center">№</th>' +
      '<th align="center">Игрок</th>' +
      '<th align="center">Рейтинг (очки/сеты)</th>' +
      '<th align="center">Атака (успешные/попытки)</th>' +
      '<th align="center">Год рождения</th>' +
      '<th align="center">Поз</th>' +
      '</tr>',
    ...rows,
    '</table>',
  ].join('');
}

function aggregateCurrentSeasonStatistics(
  players: ITeamStatistics['players'],
): ITeamStatistics['players'] {
  const totals = new Map<string, ITeamStatistics['players'][number]>();
  const fields = [
    'points',
    'setsPlayed',
    'attackAttempts',
    'successfulAttacks',
  ] as const;

  for (const player of players) {
    const key = `${player.fullName}:${player.teamName}:${player.seasonName}`;
    const stored = totals.get(key);

    if (!stored) {
      totals.set(key, { ...player });
      continue;
    }

    for (const field of fields) {
      if (stored[field] !== null || player[field] !== null) {
        stored[field] = (stored[field] ?? 0) + (player[field] ?? 0);
      }
    }
  }

  return [...totals.values()];
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

export function formatPlayerPosition(
  position: string | null | undefined,
): string {
  if (!position) {
    return '—';
  }

  const normalizedPosition = position.trim().toLowerCase();
  return (
    PLAYER_POSITION_SHORT_LABELS[normalizedPosition] ?? escapeHtml(position)
  );
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
    Number(right.position !== null) - Number(left.position !== null) ||
    Number(right.shirtNumber !== null) - Number(left.shirtNumber !== null)
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
