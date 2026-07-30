import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PlayersEntity } from './players.entity';
import { ChampionshipsEntity } from './championships.entity';
import { TeamEntity } from './team.entity';

@Entity({ name: 'player_statistics' })
@Index(['player', 'team', 'championship'], { unique: true })
export class PlayerStatisticsEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => PlayersEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: PlayersEntity;

  @ManyToOne(() => TeamEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;

  @ManyToOne(() => ChampionshipsEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'championship_id' })
  championship: ChampionshipsEntity;

  @Column({ name: 'matches_played', type: 'smallint' })
  matchesPlayed: number;

  @Column({ type: 'integer' })
  points: number;

  @Column({ name: 'sets_played', type: 'smallint' })
  setsPlayed: number;

  @Column({
    name: 'source_updated_at',
    type: 'timestamptz',
  })
  sourceUpdatedAt: Date;

  get rating(): number {
    return this.setsPlayed ? this.points / this.setsPlayed : 0;
  }
}
