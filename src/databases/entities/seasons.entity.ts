import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { CompetitionStagesEntity } from './competition-stages.entity';

@Entity({ name: 'seasons' })
export class SeasonsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @OneToMany(() => CompetitionStagesEntity, (stage) => stage.season)
  stages: CompetitionStagesEntity[];
}
