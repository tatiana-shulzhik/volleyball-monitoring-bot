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
  team: (teamId: number) => `team:${teamId}`,
} as const;

export const TELEGRAM_CALLBACK_PATTERNS = {
  season: /^season:(\d+)$/,
  championship: /^championship:(\d+):(\d+)$/,
  league: /^league:(\d+):(\d+):(\d+)$/,
  development: /^team:|^menu:(?!back|statistics)/,
} as const;
