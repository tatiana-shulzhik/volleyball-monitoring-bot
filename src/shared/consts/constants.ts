export const CEV_BASE_URL = 'https://www-old.cev.eu';
export const LEGA_VOLLEY_BASE_URL = 'https://www.legavolley.it';
export const LEGA_VOLLEY_FEMMINILE_BASE_URL =
  'https://www.legavolleyfemminile.it';
export const LEGA_VOLLEY_FEMMINILE_SEASONS_PATH = '/classifica/';
export const LEGA_VOLLEY_FEMMINILE_CATALOG_PATH = '/calendario/';
export const LEGA_VOLLEY_FEMMINILE_RESULTS_PATH = '/risultati/';
export const LEGA_VOLLEY_FEMMINILE_STATISTICS_URL =
  'https://ww5.legavolleyfemminile.it/TabellinoGara_i.asp?IdGara=';
export const LEGA_VOLLEY_FEMMINILE_SUMMER_TOUR_2023_PRESENTATION_URL =
  'https://www.legavolleyfemminile.it/la-presentazione-del-lega-volley-summer-tour-2023-dalle-coppe-ai-roster-delle-squadre-fabris-sara-la-giusta-conclusione-di-una-stagione-meravigliosa/';
export const LEGA_VOLLEY_FEMMINILE_SUMMER_TOUR_2023_URLS = {
  supercoppa:
    'https://www.legavolleyfemminile.it/back-to-back-la-supercoppa-resta-a-casalmaggiore-le-rosa-conquistano-la-tappa-del-lega-volley-summer-tour-con-super-zago/',
  coppaItalia:
    'https://www.legavolleyfemminile.it/sotto-il-sole-di-riccione-nel-weekend-della-notte-rosa-in-palio-la-23-coppa-italia-del-lega-volley-summer-tour/',
  campionatoItaliano:
    'https://www.legavolleyfemminile.it/a-lignano-sabbiadoro-lultima-tappa-del-lega-volley-summer-tour-2023-in-palio-lo-scudetto/',
} as const;

export const CEV_CALENDAR_URL = `${CEV_BASE_URL}/calendar.aspx`;

export const MAX_ATTEMPTS = 3;

export const CEV_HTTP_CONCURRENCY = 50;

export const LEGA_VOLLEY_HTTP_CONCURRENCY = 50;

export const LEGA_VOLLEY_HTTP_TIMEOUT_MS = 15_000;

export const PREVIOUS_YEARS_COUNT = 3;
export const AGGREGATED_SEASONS_COUNT = PREVIOUS_YEARS_COUNT + 1;

export const TEAM_STATISTICS_CACHE_TTL_SECONDS = 10 * 60;

export const WRITE_BATCH_SIZE = 5000;

/** Матч попадает в мониторинг за 36 часов до планового начала. */
export const MATCH_MONITORING_WINDOW_HOURS = 36;

/** Заявка команды проверяется за 30 минут до матча. */
export const MATCH_ROSTER_CHECK_WINDOW_MINUTES = 30;

/** Стартовый состав проверяется за 10 минут до начала матча. */
export const MATCH_STARTING_LINEUP_CHECK_WINDOW_MINUTES = 10;

/** Максимальное время live-проверок матча после его планового начала. */
export const LIVE_MONITORING_MAX_MATCH_AGE_HOURS = 5;

export const MOSCOW_TIME_ZONE = 'Europe/Moscow';

export const CEV_COUNTRIES: Record<string, string> = {
  ALB: 'Albania',
  AND: 'Andorra',
  ARM: 'Armenia',
  AUT: 'Austria',
  AZE: 'Azerbaijan',
  BEL: 'Belgium',
  BIH: 'Bosnia and Herzegovina',
  BLR: 'Belarus',
  BUL: 'Bulgaria',
  CRO: 'Croatia',
  CYP: 'Cyprus',
  CZE: 'Czech Republic',
  DEN: 'Denmark',
  ENG: 'England',
  ESP: 'Spain',
  EST: 'Estonia',
  FAR: 'Faroe Islands',
  FIN: 'Finland',
  FRA: 'France',
  GEO: 'Georgia',
  GER: 'Germany',
  GRE: 'Greece',
  HUN: 'Hungary',
  IRL: 'Ireland',
  ISL: 'Iceland',
  ISR: 'Israel',
  ITA: 'Italy',
  KOS: 'Kosovo',
  LAT: 'Latvia',
  LIE: 'Liechtenstein',
  LTU: 'Lithuania',
  LUX: 'Luxembourg',
  MDA: 'Moldova',
  MKD: 'North Macedonia',
  MLT: 'Malta',
  MNE: 'Montenegro',
  NED: 'Netherlands',
  NIR: 'Northern Ireland',
  NOR: 'Norway',
  POL: 'Poland',
  POR: 'Portugal',
  ROU: 'Romania',
  RUS: 'Russia',
  SCO: 'Scotland',
  SRB: 'Serbia',
  SLO: 'Slovenia',
  SUI: 'Switzerland',
  SVK: 'Slovakia',
  SWE: 'Sweden',
  TUR: 'Türkiye',
  UKR: 'Ukraine',
  WAL: 'Wales',
};

export function createCompetitionUrl(
  seasonExternalId: number,
  championshipExternalId = -2,
): string {
  return (
    `${CEV_BASE_URL}/Competition-Area/Competition.aspx` +
    `?ID=${seasonExternalId}&PID=${championshipExternalId}`
  );
}

export function createTeamUrl(
  teamExternalId: string,
  seasonExternalId: number,
): string {
  return (
    `${CEV_BASE_URL}/Competition-Area/CompetitionTeamDetails.aspx` +
    `?TeamID=${teamExternalId}&ID=${seasonExternalId}`
  );
}

export function createMatchesUrl(
  seasonExternalId: number,
  championshipExternalId: number,
): string {
  return (
    `${CEV_BASE_URL}/Competition-Area/CompetitionView.aspx` +
    `?ID=${seasonExternalId}&PID=${championshipExternalId}`
  );
}

export function createMatchStatisticsUrl(matchExternalId: string): string {
  return (
    `${CEV_BASE_URL}/Competition-Area/MatchStatistics.aspx` +
    `?ID=${matchExternalId}`
  );
}

export function createMatchPageUrl(
  seasonExternalId: number,
  leagueExternalId: number,
  matchExternalId: string,
): string {
  return (
    `${CEV_BASE_URL}/Competition-Area/MatchPage.aspx` +
    `?mID=${matchExternalId}&ID=${seasonExternalId}&CID=${leagueExternalId}`
  );
}
