import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { TeamEntity } from '../../databases/entities/team.entity';

export interface PlayerRosterSource {
  team: TeamEntity;
  season: SeasonsEntity;
}

export interface SynchronizedTeams {
  teams: TeamEntity[];
  rosterSources: PlayerRosterSource[];
}
