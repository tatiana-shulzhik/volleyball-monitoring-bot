import { ICevMatchRosterPlayer } from './player-statistics.interface';

export interface IRosterNotificationViews {
  watchedHtml: string;
  fullHtml: string;
}

export interface IMatchRosterMonitoringMessageData {
  homeTeamName: string;
  awayTeamName: string;
  home: ICevMatchRosterPlayer[];
  away: ICevMatchRosterPlayer[];
  monitoredHome: ICevMatchRosterPlayer[];
  monitoredAway: ICevMatchRosterPlayer[];
  scheduledAt: Date | null;
  checkedAt: Date;
}
