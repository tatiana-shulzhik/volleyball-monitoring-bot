import { Module } from '@nestjs/common';
import { ChampionshipsModule } from '../championships/championships.module';
import { LeaguesModule } from '../leagues/leagues.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { SynchronizationController } from './synchronization.controller';
import { SynchronizationService } from './synchronization.service';

@Module({
  imports: [SeasonsModule, ChampionshipsModule, LeaguesModule],
  controllers: [SynchronizationController],
  providers: [SynchronizationService],
})
export class SynchronizationModule {}
