import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'players' })
export class PlayersEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column({ name: 'external_id', unique: true })
  externalId: string;
}
