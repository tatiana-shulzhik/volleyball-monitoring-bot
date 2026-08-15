import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ChampionshipsEntity } from './championships.entity';
import { PlayersEntity } from './players.entity';
import { TeamEntity } from './team.entity';

@Entity({ name: 'sources' })
export class SourcesEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ name: 'base_url' })
  baseUrl: string;

  @OneToMany(() => ChampionshipsEntity, (championship) => championship.source)
  championships: ChampionshipsEntity[];

  @OneToMany(() => TeamEntity, (team) => team.source)
  teams: TeamEntity[];

  @OneToMany(() => PlayersEntity, (player) => player.source)
  players: PlayersEntity[];
}
