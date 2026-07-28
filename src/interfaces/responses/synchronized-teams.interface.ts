import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { TeamEntity } from '../../databases/entities/team.entity';

export interface IPlayerRosterSource {
  team: TeamEntity;
  league: LeaguesEntity;
  season: SeasonsEntity;
}

export interface ISynchronizedTeams {
  teams: TeamEntity[];
  rosterSources: IPlayerRosterSource[];
}
