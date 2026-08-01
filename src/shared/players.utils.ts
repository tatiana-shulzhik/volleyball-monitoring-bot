import {
  ICalculatePlayerChangesParams,
  ICalculatePlayerRelationChangesParams,
  PlayerChanges,
  PlayerRelationChanges,
} from '../interfaces/requests/players.interface';
import { calculateEntityChanges } from './entity-changes.utils';
import { calculateRelationChanges } from './relation-changes.utils';

export function calculatePlayerChanges(
  data: ICalculatePlayerChangesParams,
): PlayerChanges {
  const { incoming, existing } = data;
  const uniquePlayers = [
    ...new Map(
      incoming.map(({ externalId, fullName, birthYear }) => [
        externalId,
        { externalId, fullName, birthYear },
      ]),
    ).values(),
  ];

  return calculateEntityChanges({
    incoming: uniquePlayers,
    existing,
    keyOfExisting: ({ externalId }) => externalId,
    keyOfIncoming: ({ externalId }) => externalId,
    hasChanges: (stored, player) =>
      stored.fullName !== player.fullName ||
      stored.birthYear !== player.birthYear,
  });
}

export function calculatePlayerRelationChanges(
  data: ICalculatePlayerRelationChangesParams,
): PlayerRelationChanges {
  const {
    incoming,
    existing,
    playersByExternalId,
    teamsByExternalId,
    leaguesByExternalId,
  } = data;
  const desired = new Map<string, PlayerRelationChanges['missing'][number]>();

  for (const item of incoming) {
    const player = playersByExternalId.get(item.externalId);
    const team = teamsByExternalId.get(item.teamExternalId);
    const league = leaguesByExternalId.get(item.leagueExternalId);

    if (player && team && league) {
      desired.set(createRelationKey(player.id, team.id, league.id), {
        player,
        team,
        league,
        shirtNumber: item.shirtNumber,
        position: item.position || null,
      });
    }
  }

  return calculateRelationChanges({
    desired,
    existing,
    existingKey: ({ player, team, league }) =>
      createRelationKey(player.id, team.id, league.id),
    hasChanges: (stored, incoming) =>
      stored.shirtNumber !== incoming.shirtNumber ||
      stored.position !== incoming.position,
  });
}

function createRelationKey(
  playerId: number,
  teamId: number,
  leagueId: number,
): string {
  return `${playerId}:${teamId}:${leagueId}`;
}
