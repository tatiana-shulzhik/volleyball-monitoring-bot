import { ICevMatchRosterPlayer } from './player-statistics.interface';

export interface IMatchRosterMonitoringMessageData {
  homeTeamName: string;
  awayTeamName: string;
  home: ICevMatchRosterPlayer[];
  away: ICevMatchRosterPlayer[];
  scheduledAt: Date | null;
  checkedAt: Date;
}
