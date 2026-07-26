import {
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PlayersEntity } from './players.entity';
import { SeasonsEntity } from './seasons.entity';
import { TeamEntity } from './team.entity';

@Entity({ name: 'player_team_seasons' })
@Index(['player', 'team', 'season'], { unique: true })
export class PlayerTeamSeasonEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => PlayersEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: PlayersEntity;

  @ManyToOne(() => TeamEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: TeamEntity;

  @ManyToOne(() => SeasonsEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'season_id' })
  season: SeasonsEntity;
}
