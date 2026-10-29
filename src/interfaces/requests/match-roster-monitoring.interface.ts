import { ESourceCode } from '../../shared/enums';
import { ICevMatchRosterPlayer } from './player-statistics.interface';

export interface IRosterNotificationViews {
  watchedHtml: string;
  fullHtml: string;
  fullButtonLabel?: string;
  watchedButtonLabel?: string;
}

export interface IMatchRosterMonitoringMessageData {
  championshipName: string;
  stageName: string;
  leagueName: string;
  sourceCode?: ESourceCode;
  homeTeamName: string;
  awayTeamName: string;
  home: ICevMatchRosterPlayer[];
  away: ICevMatchRosterPlayer[];
  monitoredHome: ICevMatchRosterPlayer[];
  monitoredAway: ICevMatchRosterPlayer[];
  scheduledAt: Date | null;
  checkedAt: Date;
}
