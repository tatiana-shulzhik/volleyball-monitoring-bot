export interface IPlayerStatisticsSynchronizationResult {
  loadedRows: number;
  synchronizedStageExternalIds: number[];
}

export interface IPlayerAttackStatisticsAggregate {
  championshipId: number;
  teamId: number;
  playerId: number;
  attempts: number;
  successful: number;
}
