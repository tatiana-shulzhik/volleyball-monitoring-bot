import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'synchronization_state' })
export class SynchronizationStateEntity {
  @PrimaryColumn()
  key: string;

  @Column({ name: 'completed_at', type: 'timestamptz' })
  completedAt: Date;
}
