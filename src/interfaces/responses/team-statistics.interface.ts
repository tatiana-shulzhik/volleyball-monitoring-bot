export interface ITeamPlayerStatistics {
  fullName: string;
  birthYear: number | null;
  shirtNumber: number | null;
  position: string | null;
  points: number | null;
  setsPlayed: number | null;
  attackAttempts: number | null;
  successfulAttacks: number | null;
}

export interface ITeamStatistics {
  teamName: string;
  leagueName: string;
  players: ITeamPlayerStatistics[];
}
