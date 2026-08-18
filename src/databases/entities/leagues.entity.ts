import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { CompetitionStagesEntity } from './competition-stages.entity';

@Entity({ name: 'leagues' })
@Unique(['externalId', 'stage'])
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
