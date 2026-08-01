export const CEV_BASE_URL = 'https://www-old.cev.eu';

export const CEV_CALENDAR_URL = `${CEV_BASE_URL}/calendar.aspx`;

export const MAX_ATTEMPTS = 3;

export const CEV_HTTP_CONCURRENCY = 10;

export const PREVIOUS_YEARS_COUNT = 4;

export const WRITE_BATCH_SIZE = 5000;

export const MATCH_MONITORING_WINDOW_HOURS = 36;

export const MOSCOW_TIME_ZONE = 'Europe/Moscow';

export const INITIAL_SYNCHRONIZATION_KEY = 'initial-catalog-country';

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

export function createPlayerStatisticsUrl(seasonExternalId: number): string {
  return `${CEV_BASE_URL}/Competition-Area/Statistics.aspx?ID=${seasonExternalId}`;
}

export function createMatchStatisticsUrl(matchExternalId: string): string {
  return (
    `${CEV_BASE_URL}/Competition-Area/MatchStatistics.aspx` +
    `?ID=${matchExternalId}`
  );
}
