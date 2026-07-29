import { PlayerStatisticsEntity } from '../databases/entities/player-statistics.entity';

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]/gu, '')
    .toLowerCase();
}

export function createPlayerRelationKey(
  seasonExternalId: number,
  teamName: string,
  playerName: string,
): string {
  return (
    `${seasonExternalId}:` +
    `${normalizeName(teamName)}:${normalizeName(playerName)}`
  );
}

export function uniquePlayerStatistics(
  rows: Partial<PlayerStatisticsEntity>[],
): Partial<PlayerStatisticsEntity>[] {
  return [
    ...new Map(
      rows.map((row) => [
        `${row.season?.id}:${row.team?.id}:${row.player?.id}`,
        row,
      ]),
    ).values(),
  ];
}
