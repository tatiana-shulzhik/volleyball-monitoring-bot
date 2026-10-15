import { ICevMatchLineupPlayer } from './player-statistics.interface';

export interface IAbsentStartingLineupPlayer {
  playerName: string;
  shirtNumber: number | null;
  position?: string;
}

export interface IStartingLineupMonitoringMessageData {
  homeTeamName: string;
  awayTeamName: string;
  home: ICevMatchLineupPlayer[];
  away: ICevMatchLineupPlayer[];
  absentHome: IAbsentStartingLineupPlayer[];
  absentAway: IAbsentStartingLineupPlayer[];
  homePositionsByShirtNumber: Map<number, string>;
  awayPositionsByShirtNumber: Map<number, string>;
  matchProtocolUrl?: string;
}
