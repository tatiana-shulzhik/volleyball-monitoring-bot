import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'seasons' })
export class SeasonsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'external_id', unique: true })
  externalId: number;

  @Column({ name: 'is_current', default: false })
  isCurrent: boolean;

  @Column({
    name: 'year_start',
    type: 'int',
  })
  yearStart: number;

  @Column({
    name: 'year_end',
    type: 'int',
  })
  yearEnd: number;
}
