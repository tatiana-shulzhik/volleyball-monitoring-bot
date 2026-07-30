import {
  CalculateLeagueChangesParams,
  LeagueChanges,
} from '../interfaces/requests/leagues.interface';
import { calculateEntityChanges } from './entity-changes.utils';

export function calculateLeagueChanges(
  data: CalculateLeagueChangesParams,
): LeagueChanges {
  const { incoming, existing, stagesByExternalId } = data;
  const resolved = incoming.flatMap((league) => {
    const stage = stagesByExternalId.get(league.stageExternalId);

    return stage
      ? [
          {
            externalId: league.externalId,
            name: league.name,
            stage,
          },
        ]
      : [];
  });

  return calculateEntityChanges({
    incoming: resolved,
    existing,
    hasChanges: (stored, league) =>
      stored.name !== league.name || stored.stage.id !== league.stage.id,
  });
}
