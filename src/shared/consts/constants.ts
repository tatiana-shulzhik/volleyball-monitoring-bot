export const CEV_BASE_URL = 'https://www-old.cev.eu';

export const CEV_CALENDAR_URL = `${CEV_BASE_URL}/calendar.aspx`;

export const MAX_ATTEMPTS = 3;

export const PREVIOUS_YEARS_COUNT = 3;

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
