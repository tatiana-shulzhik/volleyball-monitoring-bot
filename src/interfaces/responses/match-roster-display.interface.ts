import { MatchEntity } from '../../databases/entities/match.entity';
import { ICevMatchRosterPlayer } from '../requests/player-statistics.interface';
import { ITeamStatistics } from './team-statistics.interface';

export type MatchRosterDisplaySource = 'site' | 'database';

export interface IMatchRosterForDisplay {
  match: MatchEntity;
  homeRoster: ICevMatchRosterPlayer[];
  awayRoster: ICevMatchRosterPlayer[];
  homeStatistics: ITeamStatistics | null;
  awayStatistics: ITeamStatistics | null;
  source: MatchRosterDisplaySource;
  matchUrl: string | null;
}
