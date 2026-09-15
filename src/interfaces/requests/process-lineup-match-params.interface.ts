import { MatchEntity } from '../../databases/entities/match.entity';
import { IFetchedMatchLineup } from './player-statistics.interface';
import { IMonitoringContext } from '../responses/match-player-monitoring.interface';

export interface IProcessLineupMatchParams {
  match: MatchEntity;
  lineup: IFetchedMatchLineup;
  context: IMonitoringContext;
  now: Date;
}
