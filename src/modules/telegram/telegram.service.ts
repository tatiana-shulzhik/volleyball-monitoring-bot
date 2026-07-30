import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Markup, Telegraf } from 'telegraf';
import { TelegramConfig } from '../../configs/telegram.config';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { LeaguesRepository } from '../../databases/repositories/leagues.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import { PlayersService } from '../players/players.service';
import { formatTeamStatistics } from '../../shared/player-statistics.utils';
import { getErrorMessage } from '../../shared/error.utils';
import {
  TELEGRAM_CALLBACK_PATTERNS,
  TELEGRAM_CALLBACKS,
} from './telegram-callbacks';
import { TELEGRAM_MESSAGES } from './telegram.constants';
import { MAIN_MENU, showList } from './telegram-menu.utils';

@Injectable()
export class TelegramService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Telegraf;

  constructor(
    private readonly config: TelegramConfig,
    private readonly seasonsRepository: SeasonsRepository,
    private readonly championshipsRepository: ChampionshipsRepository,
    private readonly stagesRepository: CompetitionStagesRepository,
    private readonly leaguesRepository: LeaguesRepository,
    private readonly teamLeaguesRepository: TeamLeaguesRepository,
    private readonly playersService: PlayersService,
  ) {
    this.bot = new Telegraf(config.token);
    this.registerHandlers();
  }

  public onApplicationBootstrap(): void {
    void this.bot
      .launch({}, () => {
        this.logger.log('Telegram bot started');
      })
      .catch((error: Error) => this.logger.error(error.message));
  }

  private registerHandlers(): void {
    this.bot.use(async (context, next) => {
      if (context.chat?.id === this.config.groupId) {
        await next();
      }
    });

    this.bot.command(['start', 'menu'], async (context) => {
      await context.reply(TELEGRAM_MESSAGES.menu, MAIN_MENU);
    });

    this.bot.action(TELEGRAM_CALLBACKS.menu.statistics, async (context) => {
      const championships = await this.championshipsRepository.findBySeasonName(
        String(new Date().getFullYear()),
      );

      await showList(context, {
        items: championships.map(({ id, name }) => ({
          text: name,
          callbackData: TELEGRAM_CALLBACKS.statistics.championship(id),
        })),
        message: TELEGRAM_MESSAGES.championships.select,
        emptyMessage: TELEGRAM_MESSAGES.championships.empty,
        backText: '⬅️ Назад',
        backCallbackData: TELEGRAM_CALLBACKS.menu.back,
      });
    });

    this.bot.action(
      TELEGRAM_CALLBACKS.menu.retroStatistics,
      async (context) => {
        const seasons = await this.seasonsRepository.findFinished(new Date());

        await showList(context, {
          items: seasons.map(({ id, name }) => ({
            text: name,
            callbackData: TELEGRAM_CALLBACKS.retroStatistics.season(id),
          })),
          message: TELEGRAM_MESSAGES.seasons.select,
          emptyMessage: TELEGRAM_MESSAGES.seasons.empty,
          backText: '⬅️ Назад',
          backCallbackData: TELEGRAM_CALLBACKS.menu.back,
        });
      },
    );

    this.bot.action(
      TELEGRAM_CALLBACK_PATTERNS.retroStatistics.season,
      async (context) => {
        const seasonId = Number(context.match[1]);
        const championships =
          await this.championshipsRepository.findFinishedBySeasonId(
            seasonId,
            new Date(),
          );

        await showList(context, {
          items: championships.map(({ id, name }) => ({
            text: name,
            callbackData: TELEGRAM_CALLBACKS.retroStatistics.championship(
              id,
              seasonId,
            ),
          })),
          message: TELEGRAM_MESSAGES.championships.select,
          emptyMessage: TELEGRAM_MESSAGES.championships.empty,
          backText: '⬅️ К сезонам',
          backCallbackData: TELEGRAM_CALLBACKS.menu.retroStatistics,
        });
      },
    );

    this.bot.action(
      TELEGRAM_CALLBACK_PATTERNS.statistics.championship,
      async (context) => {
        const championshipId = Number(context.match[1]);
        const stages =
          await this.stagesRepository.findByChampionshipIdAndSeasonName(
            championshipId,
            String(new Date().getFullYear()),
          );

        await showList(context, {
          items: stages.map(({ id, name }) => ({
            text: name,
            callbackData: TELEGRAM_CALLBACKS.statistics.stage(
              id,
              championshipId,
            ),
          })),
          message: TELEGRAM_MESSAGES.stages.select,
          emptyMessage: TELEGRAM_MESSAGES.stages.empty,
          backText: '⬅️ К чемпионатам',
          backCallbackData: TELEGRAM_CALLBACKS.menu.statistics,
        });
      },
    );

    this.bot.action(
      TELEGRAM_CALLBACK_PATTERNS.statistics.stage,
      async (context) => {
        const stageId = Number(context.match[1]);
        const championshipId = Number(context.match[2]);
        const leagues = await this.leaguesRepository.findByStageId(stageId);

        await showList(context, {
          items: leagues.map(({ id, name }) => ({
            text: name,
            callbackData: TELEGRAM_CALLBACKS.statistics.league(
              id,
              stageId,
              championshipId,
            ),
          })),
          message: TELEGRAM_MESSAGES.leagues.select,
          emptyMessage: TELEGRAM_MESSAGES.leagues.empty,
          backText: '⬅️ К этапам',
          backCallbackData:
            TELEGRAM_CALLBACKS.statistics.championship(championshipId),
        });
      },
    );

    this.bot.action(
      TELEGRAM_CALLBACK_PATTERNS.statistics.league,
      async (context) => {
        const leagueId = Number(context.match[1]);
        const stageId = Number(context.match[2]);
        const championshipId = Number(context.match[3]);
        const teamLeagues =
          await this.teamLeaguesRepository.findByLeagueId(leagueId);

        await showList(context, {
          items: teamLeagues.map(({ team }) => ({
            text: team.name,
            callbackData: TELEGRAM_CALLBACKS.statistics.team(
              team.id,
              leagueId,
              stageId,
              championshipId,
            ),
          })),
          message: TELEGRAM_MESSAGES.teams.select,
          emptyMessage: TELEGRAM_MESSAGES.teams.empty,
          backText: '⬅️ К лигам',
          backCallbackData: TELEGRAM_CALLBACKS.statistics.stage(
            stageId,
            championshipId,
          ),
        });
      },
    );

    this.bot.action(
      TELEGRAM_CALLBACK_PATTERNS.statistics.team,
      async (context) => {
        const teamId = Number(context.match[1]);
        const leagueId = Number(context.match[2]);
        const stageId = Number(context.match[3]);
        const championshipId = Number(context.match[4]);
        const statistics = await this.playersService.findTeamStatistics(
          teamId,
          leagueId,
        );

        await context.answerCbQuery();
        await context.editMessageText(
          statistics
            ? formatTeamStatistics(statistics)
            : TELEGRAM_MESSAGES.teams.statisticsEmpty,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  TELEGRAM_MESSAGES.teams.back,
                  TELEGRAM_CALLBACKS.statistics.league(
                    leagueId,
                    stageId,
                    championshipId,
                  ),
                ),
              ],
            ]),
          },
        );
      },
    );

    this.bot.action(
      TELEGRAM_CALLBACK_PATTERNS.retroStatistics.championship,
      async (context) => {
        const championshipId = Number(context.match[1]);
        const seasonId = Number(context.match[2]);
        const stages = await this.stagesRepository.findByChampionshipId(
          championshipId,
          seasonId,
        );

        await showList(context, {
          items: stages.map(({ id, name }) => ({
            text: name,
            callbackData: TELEGRAM_CALLBACKS.retroStatistics.stage(
              id,
              championshipId,
              seasonId,
            ),
          })),
          message: TELEGRAM_MESSAGES.stages.select,
          emptyMessage: TELEGRAM_MESSAGES.stages.empty,
          backText: '⬅️ К чемпионатам',
          backCallbackData: TELEGRAM_CALLBACKS.retroStatistics.season(seasonId),
        });
      },
    );

    this.bot.action(
      TELEGRAM_CALLBACK_PATTERNS.retroStatistics.stage,
      async (context) => {
        const stageId = Number(context.match[1]);
        const championshipId = Number(context.match[2]);
        const seasonId = Number(context.match[3]);
        const leagues = await this.leaguesRepository.findByStageId(stageId);

        await showList(context, {
          items: leagues.map(({ id, name }) => ({
            text: name,
            callbackData: TELEGRAM_CALLBACKS.retroStatistics.league(
              id,
              stageId,
              championshipId,
              seasonId,
            ),
          })),
          message: TELEGRAM_MESSAGES.leagues.select,
          emptyMessage: TELEGRAM_MESSAGES.leagues.empty,
          backText: '⬅️ К этапам',
          backCallbackData: TELEGRAM_CALLBACKS.retroStatistics.championship(
            championshipId,
            seasonId,
          ),
        });
      },
    );

    this.bot.action(
      TELEGRAM_CALLBACK_PATTERNS.retroStatistics.league,
      async (context) => {
        const leagueId = Number(context.match[1]);
        const stageId = Number(context.match[2]);
        const championshipId = Number(context.match[3]);
        const seasonId = Number(context.match[4]);
        const teamLeagues =
          await this.teamLeaguesRepository.findByLeagueId(leagueId);

        await showList(context, {
          items: teamLeagues.map(({ team }) => ({
            text: team.name,
            callbackData: TELEGRAM_CALLBACKS.retroStatistics.team(
              team.id,
              leagueId,
              stageId,
              championshipId,
              seasonId,
            ),
          })),
          message: TELEGRAM_MESSAGES.teams.select,
          emptyMessage: TELEGRAM_MESSAGES.teams.empty,
          backText: '⬅️ К лигам',
          backCallbackData: TELEGRAM_CALLBACKS.retroStatistics.stage(
            stageId,
            championshipId,
            seasonId,
          ),
        });
      },
    );

    this.bot.action(
      TELEGRAM_CALLBACK_PATTERNS.retroStatistics.team,
      async (context) => {
        const teamId = Number(context.match[1]);
        const leagueId = Number(context.match[2]);
        const stageId = Number(context.match[3]);
        const championshipId = Number(context.match[4]);
        const seasonId = Number(context.match[5]);
        const statistics = await this.playersService.findTeamStatistics(
          teamId,
          leagueId,
        );

        await context.answerCbQuery();
        await context.editMessageText(
          statistics
            ? formatTeamStatistics(statistics)
            : TELEGRAM_MESSAGES.teams.statisticsEmpty,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  TELEGRAM_MESSAGES.teams.back,
                  TELEGRAM_CALLBACKS.retroStatistics.league(
                    leagueId,
                    stageId,
                    championshipId,
                    seasonId,
                  ),
                ),
              ],
            ]),
          },
        );
      },
    );

    this.bot.action(TELEGRAM_CALLBACK_PATTERNS.development, async (context) => {
      await context.answerCbQuery(TELEGRAM_MESSAGES.inDevelopment, {
        show_alert: true,
      });
    });

    this.bot.action(TELEGRAM_CALLBACKS.menu.back, async (context) => {
      await context.answerCbQuery();
      await context.editMessageText(TELEGRAM_MESSAGES.menu, MAIN_MENU);
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
