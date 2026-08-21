export interface ILegaVolleyFemminileCompetition {
  externalId: number;
  serie: number;
  name: string;
  seasonYear: number;
  seasonName: string;
}

export interface ILegaVolleyFemminileSeason {
  year: number;
  name: string;
}

export interface ILegaVolleyFemminilePlayer {
  externalId: string;
  fullName: string;
  birthYear: number | null;
  shirtNumber: number | null;
  position: string | null;
}

export interface ILegaVolleyFemminilePlayerStatistic extends ILegaVolleyFemminilePlayer {
  attempts: number;
  successful: number;
  points: number;
  setsPlayed: number;
}

export interface ILegaVolleyFemminileTeamRoster {
  teamExternalId: string;
  leagueExternalId: number;
  players: ILegaVolleyFemminilePlayer[];
}

export interface ILegaVolleyFemminileMatchStatistics {
  matchExternalId: string;
  home: ILegaVolleyFemminilePlayerStatistic[];
  away: ILegaVolleyFemminilePlayerStatistic[];
}
