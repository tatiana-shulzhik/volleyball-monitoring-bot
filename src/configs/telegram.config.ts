import { Injectable } from '@nestjs/common';
import { ITelegramConfig } from '../interfaces/configs/telegram.models';
import { ConfigService } from './config.service';

@Injectable()
export class TelegramConfig implements ITelegramConfig {
  public readonly token: string;
  public readonly groupId: number;

  constructor(configService: ConfigService) {
    this.token = configService.getString('TELEGRAM_BOT_TOKEN');
    this.groupId = configService.getNumber('TELEGRAM_GROUP_ID');
  }
}
