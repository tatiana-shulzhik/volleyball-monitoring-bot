import { ICevMatchLineupPlayer } from './player-statistics.interface';

export interface IAbsentStartingLineupPlayer {
  playerName: string;
  shirtNumber: number | null;
  position?: string;
}

export interface IStartingLineupPlayer extends ICevMatchLineupPlayer {
  statistics?: {
    points: number | null;
    setsPlayed: number | null;
    attackAttempts: number | null;
    successfulAttacks: number | null;
  };
}

export interface IStartingLineupMonitoringMessageData {
  championshipName: string;
  stageName: string;
  leagueName: string;
  homeTeamName: string;
  awayTeamName: string;
  home: IStartingLineupPlayer[];
  away: IStartingLineupPlayer[];
  absentHome: IAbsentStartingLineupPlayer[];
  absentAway: IAbsentStartingLineupPlayer[];
  homePositionsByShirtNumber: Map<number, string>;
  awayPositionsByShirtNumber: Map<number, string>;
  matchProtocolUrl?: string;
}
