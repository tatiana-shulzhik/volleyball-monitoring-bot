import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EMatchStatus } from '../../shared/enums';
import { LeaguesEntity } from './leagues.entity';
import { TeamEntity } from './team.entity';

@Entity({ name: 'matches' })
export class MatchEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'external_id', unique: true })
  externalId: string;

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
    name: 'monitoring_started_at',
    type: 'timestamptz',
    nullable: true,
  })
  monitoringStartedAt: Date | null;

  @Column({
    type: 'enum',
    enum: EMatchStatus,
    default: EMatchStatus.Scheduled,
  })
  status: EMatchStatus;
}
