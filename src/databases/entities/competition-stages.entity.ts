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
import { SeasonsEntity } from './seasons.entity';

@Entity({ name: 'competition_stages' })
@Unique(['externalId', 'championship'])
export class CompetitionStagesEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'external_id' })
  externalId: number;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Index()
  @ManyToOne(() => SeasonsEntity, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'season_id' })
  season: SeasonsEntity | null;

  @Index()
  @ManyToOne(() => ChampionshipsEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'championship_id' })
  championship: ChampionshipsEntity;
}
