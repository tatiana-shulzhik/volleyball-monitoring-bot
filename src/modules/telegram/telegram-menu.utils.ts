import { Context, Markup } from 'telegraf';
import { ListMenu } from '../../interfaces/telegram/menu.models';
import { TELEGRAM_CALLBACKS } from './telegram-callbacks';
import { MENU_BUTTONS } from './telegram.constants';

export const MAIN_MENU = Markup.inlineKeyboard([
  [Markup.button.callback(MENU_BUTTONS[0], TELEGRAM_CALLBACKS.menu.statistics)],
  [
    Markup.button.callback(
      MENU_BUTTONS[1],
      TELEGRAM_CALLBACKS.menu.retroStatistics,
    ),
  ],
  [
    Markup.button.callback(MENU_BUTTONS[2], TELEGRAM_CALLBACKS.menu.monitoring),
    Markup.button.callback(
      MENU_BUTTONS[3],
      TELEGRAM_CALLBACKS.menu.currentMonitoring,
    ),
  ],
  [Markup.button.callback(MENU_BUTTONS[4], TELEGRAM_CALLBACKS.menu.live)],
]);

export async function showList(
  context: Context,
  menu: ListMenu,
): Promise<void> {
  const buttons = menu.items.map(({ text, callbackData }) => [
    Markup.button.callback(text, callbackData),
  ]);

  await context.answerCbQuery();
  await context.editMessageText(
    menu.items.length ? menu.message : menu.emptyMessage,
    Markup.inlineKeyboard([
      ...buttons,
      [Markup.button.callback(menu.backText, menu.backCallbackData)],
    ]),
  );
}
