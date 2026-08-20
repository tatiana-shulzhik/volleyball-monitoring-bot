export interface IPlayerPointsAggregate {
  championshipId: number;
  teamId: number;
  playerId: number;
  points: number | null;
}

export interface IPlayerAttackStatisticsAggregate extends IPlayerPointsAggregate {
  attempts: number;
  successful: number;
  setsPlayed: number | null;
}

export interface IPlayerAttackStatisticsAggregateRow {
  championshipId: string;
  teamId: string;
  playerId: string;
  attempts: string;
  successful: string;
  points: string | null;
  setsPlayed: string | null;
}
