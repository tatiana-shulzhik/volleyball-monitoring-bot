export interface ICevPlayerStatistics {
  playerName: string;
  teamName: string;
  matchesPlayed: number;
  setsPlayed: number;
  points: number;
  rating: number;
}

export interface IFetchedPlayerStatistics {
  seasonExternalId: number;
  statistics: ICevPlayerStatistics[];
}
