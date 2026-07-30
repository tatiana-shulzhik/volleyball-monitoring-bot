import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ECompetitionType } from '../../shared/enums';
import { CompetitionStagesEntity } from './competition-stages.entity';

@Entity({ name: 'championships' })
export class ChampionshipsEntity {
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

  @OneToMany(() => CompetitionStagesEntity, (stage) => stage.championship)
  stages: CompetitionStagesEntity[];
}
