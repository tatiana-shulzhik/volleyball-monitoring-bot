import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { LeaguesEntity } from './leagues.entity';
import { PlayersEntity } from './players.entity';
import { TeamEntity } from './team.entity';

@Entity({ name: 'player_team_leagues' })
@Index(['player', 'team', 'league'], { unique: true })
export class PlayerTeamLeagueEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => PlayersEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: PlayersEntity;

  @ManyToOne(() => TeamEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;

  @Index()
  @ManyToOne(() => LeaguesEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'league_id' })
  league: LeaguesEntity;

  @Column({ name: 'shirt_number', type: 'smallint', nullable: true })
  shirtNumber: number | null;

  @Column({ type: 'varchar', nullable: true })
  position: string | null;
}
