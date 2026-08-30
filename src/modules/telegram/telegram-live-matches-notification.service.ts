import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TelegramConfig } from '../../configs/telegram.config';
import { SourcesRepository } from '../../databases/repositories/sources.repository';
import { MOSCOW_TIME_ZONE } from '../../shared/consts/constants';
import { TelegramService } from './telegram.service';

@Injectable()
export class TelegramLiveMatchesNotificationService {
  constructor(
    private readonly config: TelegramConfig,
    private readonly sourcesRepository: SourcesRepository,
    private readonly telegramService: TelegramService,
  ) {}

  @Cron('5 0 * * *', {
    name: 'daily-today-matches-notification',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async sendTodayMatchesByCron(): Promise<void> {
    const sources =
      await this.sourcesRepository.findWithLiveMatchesNotifications();

    for (const source of sources) {
      await this.telegramService.sendTodayMatches(
        this.config.groupId,
        source.code,
      );
    }
  }
}
