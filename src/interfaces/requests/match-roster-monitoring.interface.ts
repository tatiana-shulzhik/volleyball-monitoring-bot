import { ICevMatchRosterPlayer } from './player-statistics.interface';

export interface IRosterNotificationViews {
  watchedHtml: string;
  fullHtml: string;
}

export interface IMatchRosterMonitoringMessageData {
  championshipName: string;
  stageName: string;
  leagueName: string;
  homeTeamName: string;
  awayTeamName: string;
  home: ICevMatchRosterPlayer[];
  away: ICevMatchRosterPlayer[];
  monitoredHome: ICevMatchRosterPlayer[];
  monitoredAway: ICevMatchRosterPlayer[];
  scheduledAt: Date | null;
  checkedAt: Date;
}
