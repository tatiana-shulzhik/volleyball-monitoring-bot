import type {
  ILegaCompetitionRule,
  ILegaStageRule,
} from '../../interfaces/requests/lega-volley.interface';

export const CEV_BASE_URL = 'https://www-old.cev.eu';
export const LEGA_VOLLEY_BASE_URL = 'https://www.legavolley.it';
export const LEGA_VOLLEY_FEMMINILE_BASE_URL =
  'https://www.legavolleyfemminile.it';
export const LEGA_VOLLEY_FEMMINILE_SEASONS_PATH = '/classifica/';
export const LEGA_VOLLEY_FEMMINILE_CATALOG_PATH = '/calendario/';
export const LEGA_VOLLEY_FEMMINILE_RESULTS_PATH = '/risultati/';

export const CHAMPIONSHIP_RULES: ILegaCompetitionRule[] = [
  { pattern: /SuperLega/i, name: 'SuperLega' },
  { pattern: /Serie A2/i, name: 'Serie A2' },
  { pattern: /Serie A3/i, name: 'Serie A3' },
  { pattern: /Champions League/i, name: 'Champions League' },
  { pattern: /CEV Cup/i, name: 'CEV Cup' },
  { pattern: /Challenge Cup/i, name: 'Challenge Cup' },
];

export const STAGE_RULES: ILegaStageRule[] = [
  { pattern: /Regular Season/i, name: 'Regular Season' },
  { pattern: /Main Phase/i, name: 'Main Phase' },
  { pattern: /Early Round/i, name: 'Early Round' },
  { pattern: /1st Round/i, name: '1st Round' },
  { pattern: /2nd Round/i, name: '2nd Round' },
  { pattern: /Play Off 5° Posto/i, name: 'Play Off 5° Posto' },
  { pattern: /Play Off/i, name: 'Play Off' },
  { pattern: /Coppa Italia/i, name: 'Coppa Italia' },
  { pattern: /Supercoppa/i, name: 'Supercoppa' },
];

export const CEV_CALENDAR_URL = `${CEV_BASE_URL}/calendar.aspx`;

export const MAX_ATTEMPTS = 3;

export const CEV_HTTP_CONCURRENCY = 50;

export const LEGA_VOLLEY_HTTP_CONCURRENCY = 50;

export const LEGA_VOLLEY_HTTP_TIMEOUT_MS = 15_000;

export const PREVIOUS_YEARS_COUNT = 4;

export const TEAM_STATISTICS_CACHE_TTL_SECONDS = 10 * 60;

export const WRITE_BATCH_SIZE = 5000;

export const MATCH_MONITORING_WINDOW_HOURS = 36;

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
