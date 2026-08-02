import { Module } from '@nestjs/common';
import { RedisCacheModule } from '../../cache/redis-cache.module';
import { ChampionshipsModule } from '../championships/championships.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { TeamsModule } from '../teams/teams.module';
import { PlayersModule } from '../players/players.module';
import { TelegramStatisticsQueryService } from './telegram-statistics-query.service';
import { TelegramService } from './telegram.service';
import { TelegramStatisticsHandlers } from './telegram-statistics.handlers';

@Module({
  imports: [
    RedisCacheModule,
    SeasonsModule,
    ChampionshipsModule,
    TeamsModule,
    PlayersModule,
  ],
  providers: [
    TelegramService,
    TelegramStatisticsHandlers,
    TelegramStatisticsQueryService,
  ],
})
export class TelegramModule {}
