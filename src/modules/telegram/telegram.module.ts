import { Module } from '@nestjs/common';
import { RedisCacheModule } from '../../cache/redis-cache.module';
import { ChampionshipsModule } from '../championships/championships.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { TeamsModule } from '../teams/teams.module';
import { PlayersModule } from '../players/players.module';
import { TelegramService } from './telegram.service';
import { TelegramStatisticsHandlers } from './telegram-statistics.handlers';
import { TelegramAccessRepository } from '../../databases/repositories/telegram-access.repository';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { SourcesRepository } from '../../databases/repositories/sources.repository';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import { MonitoringSubscriptionsModule } from '../monitoring-subscriptions/monitoring-subscriptions.module';
import { MatchesModule } from '../matches/matches.module';
@Module({
  imports: [
    RedisCacheModule,
    SeasonsModule,
    ChampionshipsModule,
    TeamsModule,
    PlayersModule,
    MonitoringSubscriptionsModule,
    MatchesModule,
  ],
  providers: [
    TelegramService,
    TelegramStatisticsHandlers,
    TelegramAccessRepository,
    ChampionshipsRepository,
    CompetitionStagesRepository,
    SeasonsRepository,
    TeamLeaguesRepository,
    SourcesRepository,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
