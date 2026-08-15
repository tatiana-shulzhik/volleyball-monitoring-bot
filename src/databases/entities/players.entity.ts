import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SourcesEntity } from './sources.entity';

@Entity({ name: 'players' })
export class PlayersEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'external_id', unique: true })
  externalId: string;

  @ManyToOne(() => SourcesEntity, (source) => source.players, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'source_id' })
  source?: SourcesEntity | null;

  @Column({ name: 'birth_year', type: 'smallint', nullable: true })
  birthYear: number | null;
}
