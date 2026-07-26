import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { ICevTeam } from '../requests/teams.interface';

export interface SynchronizedLeagues {
  leagues: LeaguesEntity[];
  teams: ICevTeam[];
  isComplete: boolean;
}
