import type { PlayerTeamLeagueEntity } from '../databases/entities/player-team-league.entity';
import type { ITeamStatistics } from '../interfaces/responses/team-statistics.interface';
import { parseSeasonEndYear } from './season.utils';

export function getRosterStatisticsInput(relations: PlayerTeamLeagueEntity[]) {
  return {
    playerIds: [...new Set(relations.map(({ player }) => player.id))],
    championshipIds: [
      ...new Set(relations.map(({ league }) => league.stage.championship.id)),
    ],
    seasonIds: [
      ...new Set(
        relations.flatMap(({ league }) =>
          league.stage.season ? [league.stage.season.id] : [],
        ),
      ),
    ],
  };
}

export function findPreviousRosterSeason(
  relations: PlayerTeamLeagueEntity[],
  currentSeasonName: string,
): { id: number; name: string } | undefined {
  const currentYear = parseSeasonEndYear(currentSeasonName) ?? -Infinity;

  return relations
    .map(({ league }) => league.stage.season)
    .filter(
      (season): season is NonNullable<typeof season> =>
        season !== null &&
        (parseSeasonEndYear(season.name) ?? -Infinity) < currentYear,
    )
    .sort(
      (left, right) =>
        (parseSeasonEndYear(right.name) ?? -Infinity) -
        (parseSeasonEndYear(left.name) ?? -Infinity),
    )[0];
}

export function applyHistoricalRosterChanges(
  statistics: ITeamStatistics,
  relations: PlayerTeamLeagueEntity[],
  currentSeason: { id: number; name: string },
): void {
  const currentRelations = relations.filter(
    ({ league }) => league.stage.season?.id === currentSeason.id,
  );
  const previousRosterSeason = findPreviousRosterSeason(
    relations,
    currentSeason.name,
  );
  const previousRelations = previousRosterSeason
    ? relations.filter(
        ({ league }) => league.stage.season?.id === previousRosterSeason.id,
      )
    : [];
  const currentPlayerIds = new Set(
    currentRelations.map(({ player }) => player.id),
  );
  const previousPlayerIds = new Set(
    previousRelations.map(({ player }) => player.id),
  );
  const playerIdsByName = new Map(
    relations.map(({ player }) => [player.fullName, player.id]),
  );

  if (previousRosterSeason) {
    for (const player of statistics.players) {
      const playerId = playerIdsByName.get(player.fullName);
      player.rosterChange = currentPlayerIds.has(playerId ?? -1)
        ? previousPlayerIds.has(playerId ?? -1)
          ? 'stayed'
          : 'new'
        : 'left';
    }
  } else {
    for (const player of statistics.players) {
      player.rosterChange = 'unknown';
    }
  }
}
