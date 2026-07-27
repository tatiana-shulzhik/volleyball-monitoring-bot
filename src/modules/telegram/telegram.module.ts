import { Module } from '@nestjs/common';
import { SeasonsModule } from '../seasons/seasons.module';
import { TelegramService } from './telegram.service';

@Module({
  imports: [SeasonsModule],
  providers: [TelegramService],
})
export class TelegramModule {}
