import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PlayersEntity } from './players.entity';
import { SeasonsEntity } from './seasons.entity';
import { TeamEntity } from './team.entity';

@Entity({ name: 'player_statistics' })
@Index(['player', 'team', 'season'], { unique: true })
export class PlayerStatisticsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => PlayersEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: PlayersEntity;

  @ManyToOne(() => TeamEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;

  @ManyToOne(() => SeasonsEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'season_id' })
  season: SeasonsEntity;

  @Column({ name: 'matches_played', type: 'smallint' })
  matchesPlayed: number;

  @Column({ type: 'integer' })
  points: number;

  @Column({ name: 'sets_played', type: 'smallint' })
  setsPlayed: number;

  @Column({
    name: 'source_updated_at',
    type: 'timestamptz',
  })
  sourceUpdatedAt: Date;

  get rating(): number {
    return this.setsPlayed ? this.points / this.setsPlayed : 0;
  }
}
