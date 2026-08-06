export interface IPlayerAttackStatisticsAggregate {
  championshipId: number;
  teamId: number;
  playerId: number;
  attempts: number;
  successful: number;
  points: number | null;
  setsPlayed: number | null;
}
