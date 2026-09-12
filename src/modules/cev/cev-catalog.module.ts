import { Module } from '@nestjs/common';
import { ChampionshipsModule } from '../championships/championships.module';
import { LeaguesModule } from '../leagues/leagues.module';
import { MatchesModule } from '../matches/matches.module';
import { PlayersModule } from '../players/players.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { TeamsModule } from '../teams/teams.module';
import { MonitoringSubscriptionsModule } from '../monitoring-subscriptions/monitoring-subscriptions.module';
import { TelegramModule } from '../telegram/telegram.module';
import { RedisCacheModule } from '../../cache/redis-cache.module';
import { CevCatalogService } from './cev-catalog.service';
import { MatchRosterMonitoringService } from './match-roster-monitoring.service';

@Module({
  imports: [
    SeasonsModule,
    ChampionshipsModule,
    LeaguesModule,
    MatchesModule,
    TeamsModule,
    PlayersModule,
    MonitoringSubscriptionsModule,
    TelegramModule,
    RedisCacheModule,
  ],
  providers: [CevCatalogService, MatchRosterMonitoringService],
  exports: [CevCatalogService, MatchRosterMonitoringService],
})
export class CevCatalogModule {}
