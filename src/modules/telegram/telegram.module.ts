import { Module } from '@nestjs/common';
import { ChampionshipsModule } from '../championships/championships.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [SeasonsModule, ChampionshipsModule],
  providers: [TelegramService],
})
export class TelegramModule {}
