import { Context, Markup } from 'telegraf';
import { ListMenu } from '../interfaces/telegram/menu.models';
import {
  MENU_BUTTONS,
  SOURCE_BUTTONS,
} from '../modules/telegram/telegram.constants';
import { ECompetitionType, ESourceCode } from './enums';
import { TELEGRAM_CALLBACKS } from './telegram-callbacks';

function createSourceButtons() {
  return Object.values(ESourceCode).map((source) => [
    Markup.button.callback(
      SOURCE_BUTTONS[source],
      TELEGRAM_CALLBACKS.menu.selectSource(source),
    ),
  ]);
}

export const SOURCE_MENU = Markup.inlineKeyboard(createSourceButtons());

export function getAvailableCompetitionTypes(
  source: ESourceCode,
): ECompetitionType[] {
  return source === ESourceCode.Cev
    ? Object.values(ECompetitionType)
    : [ECompetitionType.Club];
}

export function createMainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(
        MENU_BUTTONS[0],
        TELEGRAM_CALLBACKS.menu.statistics,
      ),
    ],
    [
      Markup.button.callback(
        MENU_BUTTONS[1],
        TELEGRAM_CALLBACKS.menu.retroStatistics,
      ),
    ],
    [
      Markup.button.callback(
        MENU_BUTTONS[2],
        TELEGRAM_CALLBACKS.menu.monitoring,
      ),
      Markup.button.callback(
        MENU_BUTTONS[3],
        TELEGRAM_CALLBACKS.menu.currentMonitoring,
      ),
    ],
    [Markup.button.callback(MENU_BUTTONS[4], TELEGRAM_CALLBACKS.menu.live)],
    [
      Markup.button.callback(
        '⬅️ Сменить источник',
        TELEGRAM_CALLBACKS.menu.source,
      ),
    ],
  ]);
}

export function formatMainMenuMessage(source: ESourceCode): string {
  return `${SOURCE_BUTTONS[source]}\n\nВыберите раздел:`;
}

export function formatChampionshipButton(name: string): string {
  return name
    .trim()
    .replace(/\bCEV(?:\s+[A-Z0-9]+){0,2}\s+(Champions League) Volley\b/gi, '$1')
    .replace(
      /\bCEV (U\d+) Volleyball European Championship\b/gi,
      '$1 European Champ.',
    )
    .replace(/\bCEV Volleyball Challenge Cup\b/gi, 'Challenge Cup')
    .replace(/\bCEV Volleyball European League\b/gi, 'European League')
    .replace(/\bCEV(?:\s+[A-Z0-9]+){0,2}\s+(EuroVolley)\b/gi, '$1')
    .replace(
      /\bCEV (?:Volleyball )?European (Golden|Silver) League\b/gi,
      '$1 League',
    )
    .replace(/\b(Men|Women)\b/gi, (gender) => gender[0].toUpperCase())
    .replace(/\s+/g, ' ');
}

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
