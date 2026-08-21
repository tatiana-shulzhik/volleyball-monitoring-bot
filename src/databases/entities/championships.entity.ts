import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ECompetitionType } from '../../shared/enums';
import { CompetitionStagesEntity } from './competition-stages.entity';
import { SourcesEntity } from './sources.entity';

@Entity({ name: 'championships' })
@Unique(['externalId', 'source'])
export class ChampionshipsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ name: 'external_id' })
  externalId: number;

  @Column({
    name: 'competition_type',
    type: 'varchar',
    default: ECompetitionType.Club,
  })
  competitionType: ECompetitionType;

  @ManyToOne(() => SourcesEntity, (source) => source.championships, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'source_id' })
  source?: SourcesEntity | null;

  @OneToMany(() => CompetitionStagesEntity, (stage) => stage.championship)
  stages: CompetitionStagesEntity[];
}
