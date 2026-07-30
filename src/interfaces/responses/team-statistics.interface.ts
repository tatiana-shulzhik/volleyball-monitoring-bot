export interface ITeamPlayerStatistics {
  fullName: string;
  shirtNumber: number | null;
  position: string | null;
  points: number | null;
  setsPlayed: number | null;
}

export interface ITeamStatistics {
  teamName: string;
  leagueName: string;
  players: ITeamPlayerStatistics[];
}
