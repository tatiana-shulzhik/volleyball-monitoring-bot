import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ChampionshipsEntity } from './championships.entity';

@Entity({ name: 'seasons' })
export class SeasonsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @OneToMany(() => ChampionshipsEntity, (championship) => championship.season)
  championships: ChampionshipsEntity[];
}
