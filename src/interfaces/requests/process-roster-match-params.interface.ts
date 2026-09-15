import { MatchEntity } from '../../databases/entities/match.entity';
import { IFetchedMatchRoster } from './player-statistics.interface';
import { IMonitoringContext } from '../responses/match-player-monitoring.interface';

export interface IProcessRosterMatchParams {
  match: MatchEntity;
  roster: IFetchedMatchRoster;
  context: IMonitoringContext;
  now: Date;
}
