import {
  ICevMatchLineupPlayer,
  ICevPlayerAttackStatistics,
} from './player-statistics.interface';

export interface ILiveLineupMonitoringMessageData {
  homeTeamName: string;
  awayTeamName: string;
  home: ICevMatchLineupPlayer[];
  away: ICevMatchLineupPlayer[];
  homeAttackStatistics?: ICevPlayerAttackStatistics[];
  awayAttackStatistics?: ICevPlayerAttackStatistics[];
  homePositionsByShirtNumber: Map<number, string>;
  awayPositionsByShirtNumber: Map<number, string>;
  changes?: string[];
  currentSet: number;
  matchProtocolUrl?: string;
}
