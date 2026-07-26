import {
  CalculateLeagueChangesParams,
  LeagueChanges,
} from '../interfaces/requests/leagues.interface';
import { calculateEntityChanges } from './entity-changes.utils';

export function calculateLeagueChanges(
  data: CalculateLeagueChangesParams,
): LeagueChanges {
  const { incoming, existing, championshipsByExternalId } = data;
  const resolved = incoming.flatMap((league) => {
    const championship = championshipsByExternalId.get(
      league.championshipExternalId,
    );

    return championship
      ? [
          {
            externalId: league.externalId,
            name: league.name,
            championship,
          },
        ]
      : [];
  });

  return calculateEntityChanges({
    incoming: resolved,
    existing,
    hasChanges: (stored, league) =>
      stored.name !== league.name ||
      stored.championship.id !== league.championship.id,
  });
}
