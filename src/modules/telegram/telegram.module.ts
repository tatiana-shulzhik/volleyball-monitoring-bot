import { Module } from '@nestjs/common';
import { ChampionshipsModule } from '../championships/championships.module';
import { LeaguesModule } from '../leagues/leagues.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { TeamsModule } from '../teams/teams.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [SeasonsModule, ChampionshipsModule, LeaguesModule, TeamsModule],
  providers: [TelegramService],
})
export class TelegramModule {}
