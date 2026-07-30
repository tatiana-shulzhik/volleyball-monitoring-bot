import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SeasonsEntity } from './seasons.entity';
import { CompetitionStagesEntity } from './competition-stages.entity';

@Entity({ name: 'championships' })
export class ChampionshipsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'external_id', unique: true })
  externalId: number;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  @Column({ name: 'ends_at', type: 'timestamptz' })
  endsAt: Date;

  @Index()
  @ManyToOne(() => SeasonsEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'season_id' })
  season: SeasonsEntity;

  @OneToMany(() => CompetitionStagesEntity, (stage) => stage.championship)
  stages: CompetitionStagesEntity[];
}
