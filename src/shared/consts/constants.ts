import { ESourceCode } from '../enums';

export const CEV_BASE_URL = 'https://www-old.cev.eu';
export const LEGA_VOLLEY_BASE_URL = 'https://www.legavolley.it';
/** LiveScore: составы по сетам и атаки во время матча. */
export const LEGA_VOLLEY_LIVE_BASE_URL = 'https://ww2.legavolley.it';
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

// Страницы CEV могут быть объёмными. Ограничиваем потребление памяти
// во время первичной синхронизации каталога.
export const CEV_HTTP_CONCURRENCY = 40;

export const CEV_HTML_CACHE_MAX_ENTRIES = 100;

export const LEGA_VOLLEY_HTTP_CONCURRENCY = 20;

export const LEGA_VOLLEY_HTTP_TIMEOUT_MS = 15_000;

/** Серии Pre Gara для индекса Foglio Gara (match_id по командам). */
export const LEGA_VOLLEY_PREGARA_SERIES = [
  'SL',
  'A2',
  'A3bianco',
  'A3blu',
] as const;

/** CEV-турниры на legavolley.it — без live/статистики сайта; их ведёт источник CEV. */
export const LEGA_VOLLEY_EUROPEAN_CHAMPIONSHIP_NAMES = [
  'Champions League',
  'CEV Cup',
  'Challenge Cup',
] as const;

/** Коды амплуа в Foglio Gara → полные названия как на страницах команд. */
export const LEGA_VOLLEY_PREGARA_POSITION_CODES: Readonly<
  Record<string, string>
> = {
  S: 'Schiacciatore',
  P: 'Palleggiatore',
  C: 'Centrale',
  O: 'Opposto',
  L: 'Libero',
};

/** Название амплуа (как в источнике, lower) → короткий ярлык в Telegram. */
export const PLAYER_POSITION_SHORT_LABELS: Readonly<Record<string, string>> = {
  'outside spiker': 'WS',
  schiacciatore: 'WS',
  schiacciatrice: 'WS',
  opposite: 'O',
  opposto: 'O',
  'middle blocker': 'MB',
  centrale: 'MB',
  setter: 'S',
  palleggiatore: 'S',
  palleggiatrice: 'S',
  libero: 'L',
};

export const PREVIOUS_YEARS_COUNT = 3;
export const AGGREGATED_SEASONS_COUNT = PREVIOUS_YEARS_COUNT + 1;

export const TEAM_STATISTICS_CACHE_TTL_SECONDS = 10 * 60;
export const ROSTER_NOTIFICATION_TTL_SECONDS = 48 * 60 * 60;

/** Игроков на странице «Текущий мониторинг» (лимит Telegram по размеру reply_markup). */
export const CURRENT_MONITORING_PAGE_SIZE = 20;

export const WRITE_BATCH_SIZE = 5000;

/** Матч попадает в мониторинг за 36 часов до планового начала. */
export const MATCH_MONITORING_WINDOW_HOURS = 36;

/** За сколько минут до начала матча запускать проверку стартового состава. */
export const MATCH_STARTING_LINEUP_CHECK_WINDOW_MINUTES = 10;

/** Сколько минут после планового старта ещё проверять стартовый состав (пока не 2-й сет). */
export const MATCH_STARTING_LINEUP_AFTER_START_MINUTES = 90;

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
  SMR: 'San Marino',
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

/** Используется только для определения страны команды; составы берутся из MatchPage. */
export function createTeamDetailsUrl(
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

export function createLegaVolleyPregaraRosterUrl(
  sourceMatchId: string,
): string {
  return (
    `${LEGA_VOLLEY_BASE_URL}/pregara-roster` +
    `?match_id=${encodeURIComponent(sourceMatchId)}`
  );
}

export function createLegaVolleyLiveMatchUrl(sourceMatchId: string): string {
  return `${LEGA_VOLLEY_LIVE_BASE_URL}/tabellini_online/gara_${encodeURIComponent(sourceMatchId)}.html`;
}

export function createLegaVolleyFemminileMatchStatsUrl(
  sourceMatchId: string,
): string {
  return `${LEGA_VOLLEY_FEMMINILE_BASE_URL}/match-center/${sourceMatchId}/matchstats/`;
}

export function createMatchLineupUrl(
  sourceCode: ESourceCode | undefined,
  matchExternalId: string | null | undefined,
): string | undefined {
  if (sourceCode !== ESourceCode.LegaVolleyFemminile || !matchExternalId)
    return undefined;
  const sourceMatchId = matchExternalId.match(/(\d+)$/)?.[1];
  return sourceMatchId
    ? `${LEGA_VOLLEY_FEMMINILE_BASE_URL}/match-center/${sourceMatchId}/startingsix/`
    : undefined;
}

export function createMatchProtocolUrl(
  sourceCode: ESourceCode | undefined,
  matchExternalId: string | null | undefined,
): string | undefined {
  if (!matchExternalId) return undefined;

  if (sourceCode === ESourceCode.LegaVolleyFemminile) {
    const sourceMatchId = matchExternalId.match(/(\d+)$/)?.[1];
    return sourceMatchId
      ? createLegaVolleyFemminileMatchStatsUrl(sourceMatchId)
      : undefined;
  }

  if (sourceCode === ESourceCode.LegaVolley) {
    return /^\d+$/.test(matchExternalId)
      ? createLegaVolleyLiveMatchUrl(matchExternalId)
      : undefined;
  }

  return createMatchStatisticsUrl(matchExternalId);
}
