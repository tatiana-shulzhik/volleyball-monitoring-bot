export const TELEGRAM_CALLBACKS = {
  menu: {
    statistics: 'menu:statistics',
    retroStatistics: 'menu:retro-statistics',
    monitoring: 'menu:monitoring',
    currentMonitoring: 'menu:current-monitoring',
    live: 'menu:live',
    back: 'menu:back',
  },
  season: (seasonId: number) => `season:${seasonId}`,
  championship: (championshipId: number, seasonId: number) =>
    `championship:${championshipId}:${seasonId}`,
  league: (leagueId: number, championshipId: number, seasonId: number) =>
    `league:${leagueId}:${championshipId}:${seasonId}`,
  team: (
    teamId: number,
    leagueId: number,
    championshipId: number,
    seasonId: number,
  ) => `team:${teamId}:${leagueId}:${championshipId}:${seasonId}`,
} as const;

export const TELEGRAM_CALLBACK_PATTERNS = {
  season: /^season:(\d+)$/,
  championship: /^championship:(\d+):(\d+)$/,
  league: /^league:(\d+):(\d+):(\d+)$/,
  team: /^team:(\d+):(\d+):(\d+):(\d+)$/,
  development: /^menu:(?!back|statistics)/,
} as const;
