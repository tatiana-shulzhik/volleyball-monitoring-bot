import {
  ICevMatchLineupPlayer,
  ICevPlayerAttackStatistics,
} from './player-statistics.interface';

export interface ILiveLineupChangeGroup {
  teamName: string;
  items: string[];
}

export interface ILiveLineupMonitoringMessageData {
  homeTeamName: string;
  awayTeamName: string;
  home: ICevMatchLineupPlayer[];
  away: ICevMatchLineupPlayer[];
  homeAttackStatistics?: ICevPlayerAttackStatistics[];
  awayAttackStatistics?: ICevPlayerAttackStatistics[];
  homePositionsByShirtNumber: Map<number, string>;
  awayPositionsByShirtNumber: Map<number, string>;
  changes?: ILiveLineupChangeGroup[];
  currentSet: number;
  matchProtocolUrl?: string;
}
