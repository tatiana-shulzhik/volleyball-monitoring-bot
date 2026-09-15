import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { EMatchStatus } from '../../shared/enums';
import { LeaguesEntity } from './leagues.entity';
import { TeamEntity } from './team.entity';

@Entity({ name: 'matches' })
@Index(['status', 'attackStatisticsUpdatedAt'])
@Unique(['externalId', 'league'])
export class MatchEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    name: 'external_id',
    type: 'varchar',
    nullable: true,
  })
  externalId: string | null;

  @Index()
  @ManyToOne(() => LeaguesEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'league_id' })
  league: LeaguesEntity;

  @ManyToOne(() => TeamEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'home_team_id' })
  homeTeam: TeamEntity;

  @ManyToOne(() => TeamEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'away_team_id' })
  awayTeam: TeamEntity;

  @Column({ name: 'scheduled_at', type: 'timestamptz', nullable: true })
  scheduledAt: Date | null;

  @Column({
    name: 'attack_statistics_updated_at',
    type: 'timestamptz',
    nullable: true,
  })
  attackStatisticsUpdatedAt: Date | null;

  @Column({
    type: 'enum',
    enum: EMatchStatus,
    default: EMatchStatus.Scheduled,
  })
  status: EMatchStatus;
}
