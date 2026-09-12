import { ChampionshipsEntity } from './championships.entity';
import { Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { PlayersEntity } from './players.entity';

/** A player selected for monitoring in a particular championship. */
@Entity({ name: 'monitoring_subscriptions' })
export class MonitoringSubscriptionEntity {
  @PrimaryColumn({ name: 'player_id' })
  playerId: number;

  @PrimaryColumn({ name: 'championship_id' })
  championshipId: number;

  @ManyToOne(() => PlayersEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: PlayersEntity;

  @ManyToOne(() => ChampionshipsEntity, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'championship_id' })
  championship: ChampionshipsEntity;
}
