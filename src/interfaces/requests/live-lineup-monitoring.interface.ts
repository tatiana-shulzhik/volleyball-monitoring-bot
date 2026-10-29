import { ESourceCode } from '../../shared/enums';
import {
  ICevMatchLineupPlayer,
  ICevPlayerAttackStatistics,
} from './player-statistics.interface';

export interface ILiveLineupChangePlayer {
  shirtNumber: number | null;
  playerName: string;
}

export interface ILiveLineupChangeItem {
  kind: 'out' | 'in';
  player: ILiveLineupChangePlayer;
}

export interface ILiveLineupChangeGroup {
  teamName: string;
  items: ILiveLineupChangeItem[];
}

export interface ILiveLineupMonitoringMessageData {
  championshipName: string;
  stageName: string;
  leagueName: string;
  sourceCode?: ESourceCode;
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
