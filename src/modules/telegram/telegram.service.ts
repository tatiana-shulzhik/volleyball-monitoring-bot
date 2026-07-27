import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Markup, Telegraf } from 'telegraf';
import { TelegramConfig } from '../../configs/telegram.config';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { LeaguesRepository } from '../../databases/repositories/leagues.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import {
  CHAMPIONSHIPS_MESSAGE,
  EMPTY_CHAMPIONSHIPS_MESSAGE,
  EMPTY_LEAGUES_MESSAGE,
  EMPTY_SEASONS_MESSAGE,
  EMPTY_TEAMS_MESSAGE,
  IN_DEVELOPMENT_MESSAGE,
  LEAGUES_MESSAGE,
  MENU_BUTTONS,
  MENU_MESSAGE,
  SEASONS_MESSAGE,
  TEAMS_MESSAGE,
} from './telegram.constants';

@Injectable()
export class TelegramService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Telegraf;

  constructor(
    private readonly config: TelegramConfig,
    private readonly seasonsRepository: SeasonsRepository,
    private readonly championshipsRepository: ChampionshipsRepository,
    private readonly leaguesRepository: LeaguesRepository,
    private readonly teamLeaguesRepository: TeamLeaguesRepository,
  ) {
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

    this.bot.action('menu:statistics', async (context) => {
      if (context.chat?.id !== this.config.groupId) return;

      const seasons = await this.seasonsRepository.findCurrent();
      const buttons = seasons.map(({ id, name }) => [
        Markup.button.callback(name, `season:${id}`),
      ]);

      await context.answerCbQuery();
      await context.editMessageText(
        seasons.length ? SEASONS_MESSAGE : EMPTY_SEASONS_MESSAGE,
        Markup.inlineKeyboard([
          ...buttons,
          [Markup.button.callback('⬅️ Назад', 'menu:back')],
        ]),
      );
    });

    this.bot.action(/^season:(\d+)$/, async (context) => {
      if (context.chat?.id !== this.config.groupId) return;

      const seasonId = Number(context.match[1]);
      const championships =
        await this.championshipsRepository.findBySeasonId(seasonId);
      const buttons = championships.map(({ id, name }) => [
        Markup.button.callback(name, `championship:${id}:${seasonId}`),
      ]);

      await context.answerCbQuery();
      await context.editMessageText(
        championships.length
          ? CHAMPIONSHIPS_MESSAGE
          : EMPTY_CHAMPIONSHIPS_MESSAGE,
        Markup.inlineKeyboard([
          ...buttons,
          [Markup.button.callback('⬅️ К сезонам', 'menu:statistics')],
        ]),
      );
    });

    this.bot.action(/^championship:(\d+):(\d+)$/, async (context) => {
      if (context.chat?.id !== this.config.groupId) return;

      const championshipId = Number(context.match[1]);
      const seasonId = Number(context.match[2]);
      const leagues =
        await this.leaguesRepository.findByChampionshipId(championshipId);
      const buttons = leagues.map(({ id, name }) => [
        Markup.button.callback(
          name,
          `league:${id}:${championshipId}:${seasonId}`,
        ),
      ]);

      await context.answerCbQuery();
      await context.editMessageText(
        leagues.length ? LEAGUES_MESSAGE : EMPTY_LEAGUES_MESSAGE,
        Markup.inlineKeyboard([
          ...buttons,
          [Markup.button.callback('⬅️ К чемпионатам', `season:${seasonId}`)],
        ]),
      );
    });

    this.bot.action(/^league:(\d+):(\d+):(\d+)$/, async (context) => {
      if (context.chat?.id !== this.config.groupId) return;

      const leagueId = Number(context.match[1]);
      const championshipId = Number(context.match[2]);
      const seasonId = Number(context.match[3]);
      const teamLeagues =
        await this.teamLeaguesRepository.findByLeagueId(leagueId);
      const buttons = teamLeagues.map(({ team }) => [
        Markup.button.callback(team.name, `team:${team.id}`),
      ]);

      await context.answerCbQuery();
      await context.editMessageText(
        teamLeagues.length ? TEAMS_MESSAGE : EMPTY_TEAMS_MESSAGE,
        Markup.inlineKeyboard([
          ...buttons,
          [
            Markup.button.callback(
              '⬅️ К лигам',
              `championship:${championshipId}:${seasonId}`,
            ),
          ],
        ]),
      );
    });

    this.bot.action(/^team:/, async (context) => {
      if (context.chat?.id !== this.config.groupId) return;

      await context.answerCbQuery(IN_DEVELOPMENT_MESSAGE, {
        show_alert: true,
      });
    });

    this.bot.action('menu:back', async (context) => {
      if (context.chat?.id !== this.config.groupId) return;
      await context.answerCbQuery();
      await context.editMessageText(MENU_MESSAGE, this.menu);
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
