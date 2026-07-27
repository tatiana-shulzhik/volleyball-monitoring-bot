import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Markup, Telegraf } from 'telegraf';
import { TelegramConfig } from '../../configs/telegram.config';
import {
  IN_DEVELOPMENT_MESSAGE,
  MENU_BUTTONS,
  MENU_MESSAGE,
} from './telegram.constants';

@Injectable()
export class TelegramService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Telegraf;

  constructor(private readonly config: TelegramConfig) {
    this.bot = new Telegraf(config.token);
    this.registerHandlers();
  }

  public onApplicationBootstrap(): void {
    void this.bot
      .launch({}, () => this.logger.log('Telegram bot started'))
      .catch((error: Error) => this.logger.error(error.message));
  }

  public onApplicationShutdown(): void {
    this.bot.stop();
  }

  private registerHandlers(): void {
    this.bot.command(['start', 'menu'], async (context) => {
      if (context.chat.id !== this.config.groupId) return;

      await context.reply(MENU_MESSAGE, this.menu);
    });

    this.bot.action(/^menu:/, async (context) => {
      if (context.chat?.id !== this.config.groupId) return;

      await context.answerCbQuery(IN_DEVELOPMENT_MESSAGE, {
        show_alert: true,
      });
    });

    this.bot.catch((error) => {
      this.logger.error(error instanceof Error ? error.message : String(error));
    });
  }

  private readonly menu = Markup.inlineKeyboard([
    [Markup.button.callback(MENU_BUTTONS[0], 'menu:statistics')],
    [Markup.button.callback(MENU_BUTTONS[1], 'menu:retro-statistics')],
    [
      Markup.button.callback(MENU_BUTTONS[2], 'menu:monitoring'),
      Markup.button.callback(MENU_BUTTONS[3], 'menu:current-monitoring'),
    ],
    [Markup.button.callback(MENU_BUTTONS[4], 'menu:live')],
  ]);
}
