import {
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LeaguesEntity } from './leagues.entity';
import { TeamEntity } from './team.entity';

@Entity({ name: 'team_leagues' })
@Index(['team', 'league'], { unique: true })
export class TeamLeagueEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TeamEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;

  @ManyToOne(() => LeaguesEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'league_id' })
  league: LeaguesEntity;
}
