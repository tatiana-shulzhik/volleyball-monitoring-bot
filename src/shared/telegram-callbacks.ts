import { ECompetitionType, ESourceCode } from './enums';

const COMPETITION_TYPE_CODES: Record<ECompetitionType, string> = {
  [ECompetitionType.Club]: 'c',
  [ECompetitionType.NationalTeam]: 'n',
};

export function parseCompetitionType(code: string): ECompetitionType {
  return code === COMPETITION_TYPE_CODES[ECompetitionType.NationalTeam]
    ? ECompetitionType.NationalTeam
    : ECompetitionType.Club;
}

export const TELEGRAM_CALLBACKS = {
  menu: {
    statistics: 'menu:statistics',
    retroStatistics: 'menu:retro-statistics',
    monitoring: 'menu:monitoring',
    currentMonitoring: 'menu:current-monitoring',
    live: 'menu:live',
    toggleLiveMatchesNotification: (source: ESourceCode) =>
      `menu:live:notification:${source}`,
    back: 'menu:back',
    source: 'menu:source',
    selectSource: (source: ESourceCode) => `menu:source:${source}`,
  },
  statistics: {
    competitionType: (competitionType: ECompetitionType) =>
      `statistics:type:${COMPETITION_TYPE_CODES[competitionType]}`,
    season: (competitionType: ECompetitionType) =>
      `statistics:season:${COMPETITION_TYPE_CODES[competitionType]}`,
    championship: (championshipId: number, competitionType: ECompetitionType) =>
      `statistics:championship:${championshipId}:${COMPETITION_TYPE_CODES[competitionType]}`,
    stage: (
      stageId: number,
      championshipId: number,
      competitionType: ECompetitionType,
    ) =>
      `statistics:stage:${stageId}:${championshipId}:${COMPETITION_TYPE_CODES[competitionType]}`,
    team: (
      teamId: number,
      leagueId: number,
      stageId: number,
      championshipId: number,
      competitionType: ECompetitionType,
    ) =>
      `statistics:team:${teamId}:${leagueId}:${stageId}:${championshipId}:${COMPETITION_TYPE_CODES[competitionType]}`,
    teamSummary: (
      teamId: number,
      leagueId: number,
      stageId: number,
      championshipId: number,
      competitionType: ECompetitionType,
      page = 0,
    ) =>
      `statistics:team-summary:${teamId}:${leagueId}:${stageId}:${championshipId}:${COMPETITION_TYPE_CODES[competitionType]}:${page}`,
    teamExpanded: (
      teamId: number,
      leagueId: number,
      stageId: number,
      championshipId: number,
      competitionType: ECompetitionType,
      page = 0,
    ) =>
      `statistics:team-expanded:${teamId}:${leagueId}:${stageId}:${championshipId}:${COMPETITION_TYPE_CODES[competitionType]}:${page}`,
  },
  retroStatistics: {
    competitionType: (competitionType: ECompetitionType) =>
      `retro-statistics:type:${COMPETITION_TYPE_CODES[competitionType]}`,
    season: (seasonId: number, competitionType: ECompetitionType) =>
      `retro-statistics:season:${seasonId}:${COMPETITION_TYPE_CODES[competitionType]}`,
    championship: (
      championshipId: number,
      seasonId: number,
      competitionType: ECompetitionType,
    ) =>
      `retro-statistics:championship:${championshipId}:${seasonId}:${COMPETITION_TYPE_CODES[competitionType]}`,
    stage: (
      stageId: number,
      championshipId: number,
      seasonId: number,
      competitionType: ECompetitionType,
    ) =>
      `retro-statistics:stage:${stageId}:${championshipId}:${seasonId}:${COMPETITION_TYPE_CODES[competitionType]}`,
    team: (
      teamId: number,
      leagueId: number,
      stageId: number,
      championshipId: number,
      seasonId: number,
      competitionType: ECompetitionType,
    ) =>
      `retro-statistics:team:${teamId}:${leagueId}:${stageId}:${championshipId}:${seasonId}:${COMPETITION_TYPE_CODES[competitionType]}`,
    teamSummary: (
      teamId: number,
      leagueId: number,
      stageId: number,
      championshipId: number,
      seasonId: number,
      competitionType: ECompetitionType,
      page = 0,
    ) =>
      `retro-statistics:team-summary:${teamId}:${leagueId}:${stageId}:${championshipId}:${seasonId}:${COMPETITION_TYPE_CODES[competitionType]}:${page}`,
    teamExpanded: (
      teamId: number,
      leagueId: number,
      stageId: number,
      championshipId: number,
      seasonId: number,
      competitionType: ECompetitionType,
      page = 0,
    ) =>
      `retro-statistics:team-expanded:${teamId}:${leagueId}:${stageId}:${championshipId}:${seasonId}:${COMPETITION_TYPE_CODES[competitionType]}:${page}`,
  },
} as const;

const COMPETITION_TYPE_PATTERN = '(c|n)';

export const TELEGRAM_CALLBACK_PATTERNS = {
  statistics: {
    competitionType: new RegExp(
      `^statistics:type:${COMPETITION_TYPE_PATTERN}$`,
    ),
    season: new RegExp(`^statistics:season:${COMPETITION_TYPE_PATTERN}$`),
    championship: new RegExp(
      `^statistics:championship:(\\d+):${COMPETITION_TYPE_PATTERN}$`,
    ),
    stage: new RegExp(
      `^statistics:stage:(\\d+):(\\d+):${COMPETITION_TYPE_PATTERN}$`,
    ),
    team: new RegExp(
      `^statistics:team:(\\d+):(\\d+):(\\d+):(\\d+):${COMPETITION_TYPE_PATTERN}$`,
    ),
    teamSummary: new RegExp(
      `^statistics:team-summary:(\\d+):(\\d+):(\\d+):(\\d+):${COMPETITION_TYPE_PATTERN}(?::(\\d+))?$`,
    ),
    teamExpanded: new RegExp(
      `^statistics:team-expanded:(\\d+):(\\d+):(\\d+):(\\d+):${COMPETITION_TYPE_PATTERN}(?::(\\d+))?$`,
    ),
  },
  retroStatistics: {
    competitionType: new RegExp(
      `^retro-statistics:type:${COMPETITION_TYPE_PATTERN}$`,
    ),
    season: new RegExp(
      `^retro-statistics:season:(\\d+):${COMPETITION_TYPE_PATTERN}$`,
    ),
    championship: new RegExp(
      `^retro-statistics:championship:(\\d+):(\\d+):${COMPETITION_TYPE_PATTERN}$`,
    ),
    stage: new RegExp(
      `^retro-statistics:stage:(\\d+):(\\d+):(\\d+):${COMPETITION_TYPE_PATTERN}$`,
    ),
    team: new RegExp(
      `^retro-statistics:team:(\\d+):(\\d+):(\\d+):(\\d+):(\\d+):${COMPETITION_TYPE_PATTERN}$`,
    ),
    teamSummary: new RegExp(
      `^retro-statistics:team-summary:(\\d+):(\\d+):(\\d+):(\\d+):(\\d+):${COMPETITION_TYPE_PATTERN}(?::(\\d+))?$`,
    ),
    teamExpanded: new RegExp(
      `^retro-statistics:team-expanded:(\\d+):(\\d+):(\\d+):(\\d+):(\\d+):${COMPETITION_TYPE_PATTERN}(?::(\\d+))?$`,
    ),
  },
  development: /^menu:(?!back|statistics|retro-statistics)/,
  source: new RegExp(`^menu:source:(${Object.values(ESourceCode).join('|')})$`),
  liveMatchesNotification: new RegExp(
    `^menu:live:notification:(${Object.values(ESourceCode).join('|')})$`,
  ),
} as const;
