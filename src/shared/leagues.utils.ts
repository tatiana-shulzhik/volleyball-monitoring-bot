import {
  CalculateLeagueChangesParams,
  LeagueChanges,
} from '../interfaces/requests/leagues.interface';
import { createCompetitionStageKey } from './competition-stages.utils';
import { calculateEntityChanges } from './entity-changes.utils';

export function calculateLeagueChanges(
  data: CalculateLeagueChangesParams,
): LeagueChanges {
  const { incoming, existing, stagesByKey } = data;
  const resolved = incoming.flatMap((league) => {
    const stage = stagesByKey.get(
      createCompetitionStageKey(
        league.championshipExternalId,
        league.stageExternalId,
      ),
    );

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
    keyOfExisting: ({ externalId }) => externalId,
    keyOfIncoming: ({ externalId }) => externalId,
    hasChanges: (stored, league) =>
      stored.name !== league.name || stored.stage.id !== league.stage.id,
  });
}
