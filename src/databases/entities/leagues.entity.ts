import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CompetitionStagesEntity } from './competition-stages.entity';

@Entity({ name: 'leagues' })
export class LeaguesEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'external_id', unique: true })
  externalId: number;

  @ManyToOne(() => CompetitionStagesEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'stage_id' })
  stage: CompetitionStagesEntity;
}
