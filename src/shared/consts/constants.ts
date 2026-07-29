export const CEV_BASE_URL = 'https://www-old.cev.eu';

export const CEV_CALENDAR_URL = `${CEV_BASE_URL}/calendar.aspx`;

export const MAX_ATTEMPTS = 3;

export const CEV_HTTP_CONCURRENCY = 10;

export const PREVIOUS_YEARS_COUNT = 3;

export const WRITE_BATCH_SIZE = 5000;

export const MATCH_MONITORING_WINDOW_HOURS = 36;

export const MOSCOW_TIME_ZONE = 'Europe/Moscow';

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
