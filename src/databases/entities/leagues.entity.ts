import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChampionshipsEntity } from './championships.entity';

@Entity({ name: 'leagues' })
export class LeaguesEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'external_id', unique: true })
  externalId: number;

  @ManyToOne(() => ChampionshipsEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'championship_id' })
  championship: ChampionshipsEntity;
}
