import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ECompetitionType } from '../../shared/enums';
import { ChampionshipsEntity } from './championships.entity';

@Entity({ name: 'seasons' })
@Unique(['competitionType', 'yearStart', 'yearEnd'])
export class SeasonsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

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

  @OneToMany(() => ChampionshipsEntity, (championship) => championship.season)
  championships: ChampionshipsEntity[];
}
