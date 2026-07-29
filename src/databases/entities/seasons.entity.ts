import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ECompetitionType } from '../../shared/enums';

@Entity({ name: 'seasons' })
export class SeasonsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'external_id', unique: true })
  externalId: number;

  @Column({
    name: 'competition_type',
    type: 'varchar',
    default: ECompetitionType.Club,
  })
  competitionType: ECompetitionType;

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

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @Column({ name: 'statistics_loaded', default: false })
  statisticsLoaded: boolean;
}
