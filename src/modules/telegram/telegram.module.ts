import { Module } from '@nestjs/common';
import { RedisCacheModule } from '../../cache/redis-cache.module';
import { ChampionshipsModule } from '../championships/championships.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { TeamsModule } from '../teams/teams.module';
import { PlayersModule } from '../players/players.module';
import { TelegramStatisticsQueryService } from './telegram-statistics-query.service';
import { TelegramService } from './telegram.service';
import { TelegramStatisticsHandlers } from './telegram-statistics.handlers';
import { TelegramAccessRepository } from '../../databases/repositories/telegram-access.repository';
import { MatchesRepository } from '../../databases/repositories/matches.repository';
import { SourcesRepository } from '../../databases/repositories/sources.repository';
import { TelegramLiveMatchesNotificationService } from './telegram-live-matches-notification.service';

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
    TelegramAccessRepository,
    TelegramLiveMatchesNotificationService,
    MatchesRepository,
    SourcesRepository,
  ],
})
export class TelegramModule {}
