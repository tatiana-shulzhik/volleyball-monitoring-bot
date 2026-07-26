import {
  CalculatePlayerChangesParams,
  CalculatePlayerRelationChangesParams,
  PlayerChanges,
  PlayerRelationChanges,
} from '../interfaces/requests/players.interface';
import { calculateEntityChanges } from './entity-changes.utils';
import { calculateRelationChanges } from './relation-changes.utils';

export function calculatePlayerChanges(
  data: CalculatePlayerChangesParams,
): PlayerChanges {
  const { incoming, existing } = data;
  const uniquePlayers = [
    ...new Map(
      incoming.map(({ externalId, fullName, position }) => [
        externalId,
        { externalId, fullName, position },
      ]),
    ).values(),
  ];

  return calculateEntityChanges({
    incoming: uniquePlayers,
    existing,
    hasChanges: (stored, player) =>
      stored.fullName !== player.fullName ||
      stored.position !== player.position,
  });
}

export function calculatePlayerRelationChanges(
  data: CalculatePlayerRelationChangesParams,
): PlayerRelationChanges {
  const {
    incoming,
    existing,
    playersByExternalId,
    teamsByExternalId,
    seasonsByExternalId,
  } = data;
  const desired = new Map<string, PlayerRelationChanges['missing'][number]>();

  for (const item of incoming) {
    const player = playersByExternalId.get(item.externalId);
    const team = teamsByExternalId.get(item.teamExternalId);
    const season = seasonsByExternalId.get(item.seasonExternalId);

    if (player && team && season) {
      desired.set(createRelationKey(player.id, team.id, season.id), {
        player,
        team,
        season,
      });
    }
  }

  return calculateRelationChanges({
    desired,
    existing,
    existingKey: ({ player, team, season }) =>
      createRelationKey(player.id, team.id, season.id),
  });
}

function createRelationKey(
  playerId: number,
  teamId: number,
  seasonId: number,
): string {
  return `${playerId}:${teamId}:${seasonId}`;
}
