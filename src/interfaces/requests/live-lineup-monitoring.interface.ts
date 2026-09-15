import { ICevMatchLineupPlayer } from './player-statistics.interface';

export interface ILiveLineupMonitoringMessageData {
  homeTeamName: string;
  awayTeamName: string;
  home: ICevMatchLineupPlayer[];
  away: ICevMatchLineupPlayer[];
  homePositionsByShirtNumber: Map<number, string>;
  awayPositionsByShirtNumber: Map<number, string>;
  currentSet: number;
  matchProtocolUrl?: string;
}
