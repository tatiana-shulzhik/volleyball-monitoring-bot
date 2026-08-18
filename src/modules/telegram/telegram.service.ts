import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Telegraf } from 'telegraf';
import { TelegramConfig } from '../../configs/telegram.config';
import { getErrorMessage } from '../../shared/error.utils';
import {
  TELEGRAM_CALLBACK_PATTERNS,
  TELEGRAM_CALLBACKS,
} from './telegram-callbacks';
import { TELEGRAM_MESSAGES } from './telegram.constants';
import { SOURCE_MENU } from './telegram-menu.utils';
import { TelegramStatisticsHandlers } from './telegram-statistics.handlers';

@Injectable()
export class TelegramService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Telegraf;
  private isRunning = false;

  constructor(
    private readonly config: TelegramConfig,
    private readonly statisticsHandlers: TelegramStatisticsHandlers,
  ) {
    this.bot = new Telegraf(config.token);
    this.registerHandlers();
  }

  onApplicationBootstrap(): void {
    void this.bot
      .launch({}, () => {
        this.isRunning = true;
        this.logger.log('Telegram bot started');
      })
      .catch((error: unknown) => {
        this.isRunning = false;
        this.logger.error(getErrorMessage(error));
      });
  }

  onApplicationShutdown(signal?: string): void {
    if (!this.isRunning) {
      return;
    }

    this.bot.stop(signal ?? 'Application shutdown');
    this.isRunning = false;
    this.logger.log('Telegram bot stopped');
  }

  private registerHandlers(): void {
    this.bot.use(async (context, next) => {
      if (context.chat?.id === this.config.groupId) {
        await next();
      }
    });

    this.bot.command(['start', 'menu'], async (context) => {
      await context.reply(TELEGRAM_MESSAGES.sources.select, SOURCE_MENU);
    });

    this.statisticsHandlers.register(this.bot);

    this.bot.action(TELEGRAM_CALLBACK_PATTERNS.development, async (context) => {
      await context.answerCbQuery(TELEGRAM_MESSAGES.inDevelopment, {
        show_alert: true,
      });
    });

    this.bot.catch(async (error, context) => {
      this.logger.error(getErrorMessage(error));

      if (context.callbackQuery) {
        await context
          .answerCbQuery(TELEGRAM_MESSAGES.error, { show_alert: true })
          .catch((notificationError: Error) => {
            this.logger.warn(notificationError.message);
          });
      }
    });
  }
}
