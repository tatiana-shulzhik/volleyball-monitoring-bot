import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ChampionshipsEntity } from './championships.entity';

@Entity({ name: 'competition_stages' })
@Unique(['externalId', 'championship'])
export class CompetitionStagesEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'external_id' })
  externalId: number;

  @Index()
  @ManyToOne(() => ChampionshipsEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'championship_id' })
  championship: ChampionshipsEntity;
}
