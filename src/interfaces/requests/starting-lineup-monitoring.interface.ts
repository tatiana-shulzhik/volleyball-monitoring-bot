import { ICevMatchLineupPlayer } from './player-statistics.interface';

export interface IStartingLineupMonitoringMessageData {
  homeTeamName: string;
  awayTeamName: string;
  home: ICevMatchLineupPlayer[];
  away: ICevMatchLineupPlayer[];
  homePositionsByShirtNumber: Map<number, string>;
  awayPositionsByShirtNumber: Map<number, string>;
  matchProtocolUrl?: string;
}
