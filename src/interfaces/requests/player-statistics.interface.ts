export interface ICevPlayerStatistics {
  playerName: string;
  teamName: string;
  matchesPlayed: number;
  setsPlayed: number;
  points: number;
  rating: number;
}

export interface IFetchedPlayerStatistics {
  championshipExternalId: number;
  stageExternalId: number;
  statistics: ICevPlayerStatistics[];
}

export interface ICevPlayerAttackStatistics {
  playerName: string;
  attempts: number;
  successful: number;
}

export interface IFetchedMatchAttackStatistics {
  matchExternalId: string;
  home: ICevPlayerAttackStatistics[];
  away: ICevPlayerAttackStatistics[];
}
