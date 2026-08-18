import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { SourcesEntity } from './sources.entity';

@Entity({ name: 'synchronization_state' })
export class SynchronizationStateEntity {
  @PrimaryColumn()
  key: string;

  @ManyToOne(() => SourcesEntity, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_id' })
  source?: SourcesEntity | null;

  @Column({ name: 'completed_at', type: 'timestamptz' })
  completedAt: Date;
}
