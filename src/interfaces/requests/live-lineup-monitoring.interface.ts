import { ESourceCode } from '../../shared/enums';
import {
  ICevMatchLineupPlayer,
  ICevPlayerAttackStatistics,
} from './player-statistics.interface';

export interface ILiveLineupMonitoringMessageData {
  championshipName: string;
  stageName: string;
  leagueName: string;
  sourceCode?: ESourceCode;
  homeTeamName: string;
  awayTeamName: string;
  changes?: {
    teamName: string;
    playerName: string;
    shirtNumber: number | null;
    entered: boolean;
  }[];
  home: ICevMatchLineupPlayer[];
  away: ICevMatchLineupPlayer[];
  homeAttackStatistics?: ICevPlayerAttackStatistics[];
  awayAttackStatistics?: ICevPlayerAttackStatistics[];
  homePositionsByShirtNumber: Map<number, string>;
  awayPositionsByShirtNumber: Map<number, string>;
  currentSet: number;
  scheduledAt: Date | null;
  matchProtocolUrl?: string;
}
