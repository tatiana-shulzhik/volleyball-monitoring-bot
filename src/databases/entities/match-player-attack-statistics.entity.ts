import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MatchEntity } from './match.entity';
import { PlayersEntity } from './players.entity';
import { TeamEntity } from './team.entity';

@Entity({ name: 'match_player_attack_statistics' })
@Index(['match', 'player', 'team'], { unique: true })
export class MatchPlayerAttackStatisticsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => MatchEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match: MatchEntity;

  @Index()
  @ManyToOne(() => PlayersEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: PlayersEntity;

  @ManyToOne(() => TeamEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;

  @Column({ type: 'integer' })
  attempts: number;

  @Column({ type: 'integer' })
  successful: number;

  @Column({ name: 'source_updated_at', type: 'timestamptz' })
  sourceUpdatedAt: Date;
}
