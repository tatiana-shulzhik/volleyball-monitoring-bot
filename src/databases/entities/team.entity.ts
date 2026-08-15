import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SourcesEntity } from './sources.entity';

@Entity({ name: 'teams' })
export class TeamEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'external_id', unique: true })
  externalId: string;

  @ManyToOne(() => SourcesEntity, (source) => source.teams, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'source_id' })
  source?: SourcesEntity | null;

  @Column({ type: 'varchar', nullable: true })
  country: string | null;
}
