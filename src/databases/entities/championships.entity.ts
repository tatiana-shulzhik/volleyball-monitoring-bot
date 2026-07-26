import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SeasonsEntity } from './seasons.entity';

@Entity({ name: 'championships' })
export class ChampionshipsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'external_id', unique: true })
  externalId: number;

  @ManyToOne(() => SeasonsEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'season_id' })
  season: SeasonsEntity;
}
