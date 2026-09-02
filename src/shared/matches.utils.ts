import {
  ICalculateMatchChangesParams,
  MatchChanges,
} from '../interfaces/requests/matches.interface';
import { calculateEntityChanges } from './entity-changes.utils';

export function calculateMatchChanges(
  data: ICalculateMatchChangesParams,
): MatchChanges {
  const { incoming, existing, leaguesByExternalId, teamsByExternalId } = data;
  const existingByExternalId = new Map(
    existing.map((match) => [match.externalId, match]),
  );
  const resolved = incoming.flatMap((match) => {
    const league = leaguesByExternalId.get(match.leagueExternalId);
    const homeTeam = teamsByExternalId.get(match.homeTeamExternalId);
    const awayTeam = teamsByExternalId.get(match.awayTeamExternalId);

    return league && homeTeam && awayTeam
      ? [
          {
            externalId: match.externalId,
            league,
            homeTeam,
            awayTeam,
            scheduledAt:
              match.scheduledAt ??
              existingByExternalId.get(match.externalId)?.scheduledAt ??
              null,
            monitoringStartedAt: null,
            attackStatisticsUpdatedAt: null,
            status: match.status,
          },
        ]
      : [];
  });

  return calculateEntityChanges({
    incoming: resolved,
    existing,
    keyOfExisting: ({ externalId }) => externalId,
    keyOfIncoming: ({ externalId }) => externalId,
    hasChanges: (stored, match) =>
      stored.league.id !== match.league.id ||
      stored.homeTeam.id !== match.homeTeam.id ||
      stored.awayTeam.id !== match.awayTeam.id ||
      stored.scheduledAt?.getTime() !== match.scheduledAt?.getTime() ||
      stored.status !== match.status,
  });
}
