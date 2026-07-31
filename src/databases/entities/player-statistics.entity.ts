import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CompetitionStagesEntity } from './competition-stages.entity';
import { PlayersEntity } from './players.entity';
import { TeamEntity } from './team.entity';

@Entity({ name: 'player_statistics' })
@Index(['player', 'team', 'stage'], { unique: true })
export class PlayerStatisticsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => PlayersEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: PlayersEntity;

  @ManyToOne(() => TeamEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;

  @ManyToOne(() => CompetitionStagesEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'stage_id' })
  stage: CompetitionStagesEntity;

  @Column({ name: 'matches_played', type: 'smallint' })
  matchesPlayed: number;

  @Column({ type: 'integer' })
  points: number;

  @Column({ name: 'sets_played', type: 'smallint' })
  setsPlayed: number;

  @Column({ name: 'attack_attempts', type: 'integer', default: 0 })
  attackAttempts: number;

  @Column({ name: 'successful_attacks', type: 'integer', default: 0 })
  successfulAttacks: number;

  @Column({
    name: 'source_updated_at',
    type: 'timestamptz',
  })
  sourceUpdatedAt: Date;

  get rating(): number {
    return this.setsPlayed ? this.points / this.setsPlayed : 0;
  }
}
