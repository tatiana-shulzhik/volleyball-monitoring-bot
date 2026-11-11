import { Context, Markup } from 'telegraf';
import { MatchEntity } from '../databases/entities/match.entity';
import { SourcesEntity } from '../databases/entities/sources.entity';
import { ListMenu } from '../interfaces/telegram/menu.models';
import {
  MENU_BUTTONS,
  SOURCE_BUTTONS,
} from '../modules/telegram/telegram.constants';
import { ECompetitionType, ESourceCode } from './enums';
import { TELEGRAM_CALLBACKS } from './telegram-callbacks';
import { formatTodayMatchButton } from './telegram-today-matches.utils';

function createSourceButtons() {
  return Object.values(ESourceCode).map((source) => [
    Markup.button.callback(
      SOURCE_BUTTONS[source],
      TELEGRAM_CALLBACKS.menu.selectSource(source),
    ),
  ]);
}

export const SOURCE_MENU = Markup.inlineKeyboard(createSourceButtons());

export function createSourceButton() {
  return Markup.button.callback(
    '⬅️ Сменить источник',
    TELEGRAM_CALLBACKS.menu.source,
  );
}

export function createTodayMatchesKeyboard(
  matches: MatchEntity[],
  footer: ReturnType<typeof Markup.button.callback>[][] = [],
  dayOffset = 0,
  sourceCode?: ESourceCode,
) {
  const groups = new Map<string, MatchEntity[]>();
  for (const match of matches) {
    const championship = match.league.stage.championship.name;
    const group = groups.get(championship) ?? [];
    group.push(match);
    groups.set(championship, group);
  }

  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (const [championship, group] of groups) {
    rows.push([
      Markup.button.callback(
        `🏆 ${championship}`,
        TELEGRAM_CALLBACKS.live.group,
      ),
    ]);

    rows.push(
      ...group.map((match) => [
        Markup.button.callback(
          formatTodayMatchButton(match),
          TELEGRAM_CALLBACKS.live.match(match.id, dayOffset, sourceCode),
        ),
      ]),
    );
  }

  return Markup.inlineKeyboard([...rows, ...footer]);
}

export function createLiveMatchesFooter(
  source: SourcesEntity,
  showNavigation = true,
  dayOffset: 0 | 1 = 0,
  showNotification = true,
): ReturnType<typeof Markup.button.callback>[][] {
  return [
    [
      Markup.button.callback(
        `${dayOffset === 0 ? '• ' : ''}Сегодня`,
        TELEGRAM_CALLBACKS.live.period(0, source.code),
      ),
      Markup.button.callback(
        `${dayOffset === 1 ? '• ' : ''}Завтра`,
        TELEGRAM_CALLBACKS.live.period(1, source.code),
      ),
    ],
    ...(showNotification
      ? [
          [
            Markup.button.callback(
              source.liveMatchesNotificationEnabled
                ? '🔕 Выключить автоотправку'
                : '🔔 Включить автоотправку в 00:00',
              TELEGRAM_CALLBACKS.menu.toggleLiveMatchesNotification(
                source.code,
              ),
            ),
          ],
        ]
      : []),
    ...(showNavigation
      ? [
          [
            Markup.button.callback('⬅️ Назад', TELEGRAM_CALLBACKS.menu.back),
            createSourceButton(),
          ],
        ]
      : []),
  ];
}

export function createLiveMatchRosterKeyboard(
  showSourceButton = true,
  dayOffset: 0 | 1 = 0,
  sourceCode?: ESourceCode,
  matchUrl?: string | null,
  matchLineupUrl?: string,
) {
  return Markup.inlineKeyboard([
    ...(matchLineupUrl
      ? [[Markup.button.url('🔗 Страница матча', matchLineupUrl)]]
      : []),
    ...(matchUrl
      ? [[Markup.button.url('🔗 Открыть матч на сайте', matchUrl)]]
      : []),
    [
      Markup.button.callback(
        '⬅️ Назад',
        TELEGRAM_CALLBACKS.live.period(dayOffset, sourceCode),
      ),
      ...(showSourceButton ? [createSourceButton()] : []),
    ],
  ]);
}

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

export function formatCurrentMonitoringButton(
  playerName: string,
  shirtNumber: number | null,
  teamNames: string | null,
  championshipName: string,
): string {
  const text =
    `🗑 ${shirtNumber ?? '—'} ${playerName}` +
    (teamNames ? ` — ${teamNames}` : '') +
    ` — ${formatChampionshipButton(championshipName)}`;

  return text.length > 64 ? `${text.slice(0, 61)}...` : text;
}

export async function showList(
  context: Context,
  menu: ListMenu,
): Promise<void> {
  const buttons = menu.items.map(({ text, callbackData }) => [
    Markup.button.callback(text, callbackData),
  ]);

  await context.answerCbQuery(menu.answerText);
  await context.editMessageText(
    menu.items.length ? menu.message : menu.emptyMessage,
    Markup.inlineKeyboard([
      ...buttons,
      [
        Markup.button.callback(menu.backText, menu.backCallbackData),
        createSourceButton(),
      ],
    ]),
  );
}
