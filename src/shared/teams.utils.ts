import {
  CalculateTeamChangesParams,
  CalculateTeamLeagueChangesParams,
  TeamChanges,
  TeamLeagueChanges,
} from '../interfaces/requests/teams.interface';
import { calculateEntityChanges } from './entity-changes.utils';
import { calculateRelationChanges } from './relation-changes.utils';

export function calculateTeamChanges(
  data: CalculateTeamChangesParams,
): TeamChanges {
  const { incoming, existing } = data;
  const uniqueTeams = [
    ...new Map(
      incoming.map(({ externalId, name }) => [
        externalId,
        { externalId, name },
      ]),
    ).values(),
  ];

  return calculateEntityChanges({
    incoming: uniqueTeams,
    existing,
    hasChanges: (stored, team) => stored.name !== team.name,
  });
}

export function calculateTeamLeagueChanges(
  data: CalculateTeamLeagueChangesParams,
): TeamLeagueChanges {
  const { incoming, existing, teamsByExternalId, leaguesByExternalId } = data;
  const desired = new Map<string, TeamLeagueChanges['missing'][number]>();

  for (const item of incoming) {
    const team = teamsByExternalId.get(item.externalId);
    const league = leaguesByExternalId.get(item.leagueExternalId);

    if (team && league) {
      desired.set(createRelationKey(team.id, league.id), { team, league });
    }
  }

  return calculateRelationChanges({
    desired,
    existing,
    existingKey: ({ team, league }) => createRelationKey(team.id, league.id),
  });
}

function createRelationKey(teamId: number, leagueId: number): string {
  return `${teamId}:${leagueId}`;
}
