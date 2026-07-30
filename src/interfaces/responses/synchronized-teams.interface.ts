import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { TeamEntity } from '../../databases/entities/team.entity';

export interface IPlayerRosterSource {
  team: TeamEntity;
  league: LeaguesEntity;
  championship: ChampionshipsEntity;
}

export interface ISynchronizedTeams {
  teams: TeamEntity[];
  rosterSources: IPlayerRosterSource[];
}
