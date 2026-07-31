export const TELEGRAM_CALLBACKS = {
  menu: {
    statistics: 'menu:statistics',
    retroStatistics: 'menu:retro-statistics',
    monitoring: 'menu:monitoring',
    currentMonitoring: 'menu:current-monitoring',
    live: 'menu:live',
    back: 'menu:back',
  },
  statistics: {
    season: 'statistics:season',
    championship: (championshipId: number) =>
      `statistics:championship:${championshipId}`,
    stage: (stageId: number, championshipId: number) =>
      `statistics:stage:${stageId}:${championshipId}`,
    league: (leagueId: number, stageId: number, championshipId: number) =>
      `statistics:league:${leagueId}:${stageId}:${championshipId}`,
    team: (
      teamId: number,
      leagueId: number,
      stageId: number,
      championshipId: number,
    ) => `statistics:team:${teamId}:${leagueId}:${stageId}:${championshipId}`,
  },
  retroStatistics: {
    season: (seasonId: number) => `retro-statistics:season:${seasonId}`,
    championship: (championshipId: number, seasonId: number) =>
      `retro-statistics:championship:${championshipId}:${seasonId}`,
    stage: (stageId: number, championshipId: number, seasonId: number) =>
      `retro-statistics:stage:${stageId}:${championshipId}:${seasonId}`,
    league: (
      leagueId: number,
      stageId: number,
      championshipId: number,
      seasonId: number,
    ) =>
      `retro-statistics:league:${leagueId}:${stageId}:${championshipId}:${seasonId}`,
    team: (
      teamId: number,
      leagueId: number,
      stageId: number,
      championshipId: number,
      seasonId: number,
    ) =>
      `retro-statistics:team:${teamId}:${leagueId}:${stageId}:${championshipId}:${seasonId}`,
  },
} as const;

export const TELEGRAM_CALLBACK_PATTERNS = {
  statistics: {
    championship: /^statistics:championship:(\d+)$/,
    stage: /^statistics:stage:(\d+):(\d+)$/,
    league: /^statistics:league:(\d+):(\d+):(\d+)$/,
    team: /^statistics:team:(\d+):(\d+):(\d+):(\d+)$/,
  },
  retroStatistics: {
    season: /^retro-statistics:season:(\d+)$/,
    championship: /^retro-statistics:championship:(\d+):(\d+)$/,
    stage: /^retro-statistics:stage:(\d+):(\d+):(\d+)$/,
    league: /^retro-statistics:league:(\d+):(\d+):(\d+):(\d+)$/,
    team: /^retro-statistics:team:(\d+):(\d+):(\d+):(\d+):(\d+)$/,
  },
  development: /^menu:(?!back|statistics|retro-statistics)/,
} as const;
