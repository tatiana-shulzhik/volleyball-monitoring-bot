import { Injectable } from '@nestjs/common';
import { Markup, Telegraf } from 'telegraf';
import { ECompetitionType } from '../../shared/enums';
import { formatTeamStatistics } from '../../shared/player-statistics.utils';
import { PlayersService } from '../players/players.service';
import {
  parseCompetitionType,
  TELEGRAM_CALLBACK_PATTERNS,
  TELEGRAM_CALLBACKS,
} from './telegram-callbacks';
import { TelegramStatisticsQueryService } from './telegram-statistics-query.service';
import {
  COMPETITION_TYPE_BUTTONS,
  TELEGRAM_MESSAGES,
} from './telegram.constants';
import { formatChampionshipButton, showList } from './telegram-menu.utils';

@Injectable()
export class TelegramStatisticsHandlers {
  constructor(
    private readonly queries: TelegramStatisticsQueryService,
    private readonly playersService: PlayersService,
  ) {}

  register(bot: Telegraf): void {
    this.registerCurrentStatistics(bot);
    this.registerRetroStatistics(bot);
    this.registerCatalogNavigation(bot);
  }

  private registerCurrentStatistics(bot: Telegraf): void {
    bot.action(TELEGRAM_CALLBACKS.menu.statistics, async (context) => {
      await showList(context, {
        items: Object.values(ECompetitionType).map((competitionType) => ({
          text: COMPETITION_TYPE_BUTTONS[competitionType],
          callbackData:
            TELEGRAM_CALLBACKS.statistics.competitionType(competitionType),
        })),
        message: TELEGRAM_MESSAGES.competitionTypes.select,
        emptyMessage: TELEGRAM_MESSAGES.error,
        backText: '⬅️ Назад',
        backCallbackData: TELEGRAM_CALLBACKS.menu.back,
      });
    });

    bot.action(
      TELEGRAM_CALLBACK_PATTERNS.statistics.competitionType,
      async (context) => {
        const competitionType = parseCompetitionType(context.match[1]);
        const seasons = await this.queries.findCurrentSeasons(competitionType);

        await showList(context, {
          items: seasons.map(({ name }) => ({
            text: name,
            callbackData: TELEGRAM_CALLBACKS.statistics.season(competitionType),
          })),
          message: TELEGRAM_MESSAGES.seasons.select,
          emptyMessage: TELEGRAM_MESSAGES.seasons.empty,
          backText: '⬅️ К видам соревнований',
          backCallbackData: TELEGRAM_CALLBACKS.menu.statistics,
        });
      },
    );

    bot.action(
      TELEGRAM_CALLBACK_PATTERNS.statistics.season,
      async (context) => {
        const competitionType = parseCompetitionType(context.match[1]);
        const championships =
          await this.queries.findChampionships(competitionType);

        await showList(context, {
          items: championships.map(({ id, name }) => ({
            text: formatChampionshipButton(name),
            callbackData: TELEGRAM_CALLBACKS.statistics.championship(
              id,
              competitionType,
            ),
          })),
          message: TELEGRAM_MESSAGES.championships.select,
          emptyMessage: TELEGRAM_MESSAGES.championships.empty,
          backText: '⬅️ К сезонам',
          backCallbackData:
            TELEGRAM_CALLBACKS.statistics.competitionType(competitionType),
        });
      },
    );
  }

  private registerRetroStatistics(bot: Telegraf): void {
    bot.action(TELEGRAM_CALLBACKS.menu.retroStatistics, async (context) => {
      await showList(context, {
        items: Object.values(ECompetitionType).map((competitionType) => ({
          text: COMPETITION_TYPE_BUTTONS[competitionType],
          callbackData:
            TELEGRAM_CALLBACKS.retroStatistics.competitionType(competitionType),
        })),
        message: TELEGRAM_MESSAGES.competitionTypes.select,
        emptyMessage: TELEGRAM_MESSAGES.error,
        backText: '⬅️ Назад',
        backCallbackData: TELEGRAM_CALLBACKS.menu.back,
      });
    });

    bot.action(
      TELEGRAM_CALLBACK_PATTERNS.retroStatistics.competitionType,
      async (context) => {
        const competitionType = parseCompetitionType(context.match[1]);
        const seasons = await this.queries.findFinishedSeasons(competitionType);

        await showList(context, {
          items: seasons.map(({ id, name }) => ({
            text: name,
            callbackData: TELEGRAM_CALLBACKS.retroStatistics.season(
              id,
              competitionType,
            ),
          })),
          message: TELEGRAM_MESSAGES.seasons.select,
          emptyMessage: TELEGRAM_MESSAGES.seasons.empty,
          backText: '⬅️ К видам соревнований',
          backCallbackData: TELEGRAM_CALLBACKS.menu.retroStatistics,
        });
      },
    );

    bot.action(
      TELEGRAM_CALLBACK_PATTERNS.retroStatistics.season,
      async (context) => {
        const seasonId = Number(context.match[1]);
        const competitionType = parseCompetitionType(context.match[2]);
        const championships = await this.queries.findChampionships(
          competitionType,
          seasonId,
        );

        await showList(context, {
          items: championships.map(({ id, name }) => ({
            text: formatChampionshipButton(name),
            callbackData: TELEGRAM_CALLBACKS.retroStatistics.championship(
              id,
              seasonId,
              competitionType,
            ),
          })),
          message: TELEGRAM_MESSAGES.championships.select,
          emptyMessage: TELEGRAM_MESSAGES.championships.empty,
          backText: '⬅️ К сезонам',
          backCallbackData:
            TELEGRAM_CALLBACKS.retroStatistics.competitionType(competitionType),
        });
      },
    );
  }

  private registerCatalogNavigation(bot: Telegraf): void {
    bot.action(
      [
        TELEGRAM_CALLBACK_PATTERNS.statistics.championship,
        TELEGRAM_CALLBACK_PATTERNS.retroStatistics.championship,
      ],
      async (context) => {
        const isRetro = context.match[0].startsWith('retro-statistics:');
        const championshipId = Number(context.match[1]);
        const seasonId = isRetro ? Number(context.match[2]) : undefined;
        const competitionType = parseCompetitionType(
          context.match[isRetro ? 3 : 2],
        );
        const stages = await this.queries.findStages(
          championshipId,
          competitionType,
          seasonId,
        );

        await showList(context, {
          items: stages.map(({ id, name }) => ({
            text: name,
            callbackData: seasonId
              ? TELEGRAM_CALLBACKS.retroStatistics.stage(
                  id,
                  championshipId,
                  seasonId,
                  competitionType,
                )
              : TELEGRAM_CALLBACKS.statistics.stage(
                  id,
                  championshipId,
                  competitionType,
                ),
          })),
          message: TELEGRAM_MESSAGES.stages.select,
          emptyMessage: TELEGRAM_MESSAGES.stages.empty,
          backText: '⬅️ К чемпионатам',
          backCallbackData: seasonId
            ? TELEGRAM_CALLBACKS.retroStatistics.season(
                seasonId,
                competitionType,
              )
            : TELEGRAM_CALLBACKS.statistics.season(competitionType),
        });
      },
    );

    bot.action(
      [
        TELEGRAM_CALLBACK_PATTERNS.statistics.stage,
        TELEGRAM_CALLBACK_PATTERNS.retroStatistics.stage,
      ],
      async (context) => {
        const isRetro = context.match[0].startsWith('retro-statistics:');
        const stageId = Number(context.match[1]);
        const championshipId = Number(context.match[2]);
        const seasonId = isRetro ? Number(context.match[3]) : undefined;
        const competitionType = parseCompetitionType(
          context.match[isRetro ? 4 : 3],
        );
        const leagues = await this.queries.findLeagues(stageId);

        await showList(context, {
          items: leagues.map(({ id, name }) => ({
            text: name,
            callbackData: seasonId
              ? TELEGRAM_CALLBACKS.retroStatistics.league(
                  id,
                  stageId,
                  championshipId,
                  seasonId,
                  competitionType,
                )
              : TELEGRAM_CALLBACKS.statistics.league(
                  id,
                  stageId,
                  championshipId,
                  competitionType,
                ),
          })),
          message: TELEGRAM_MESSAGES.leagues.select,
          emptyMessage: TELEGRAM_MESSAGES.leagues.empty,
          backText: '⬅️ К этапам',
          backCallbackData: seasonId
            ? TELEGRAM_CALLBACKS.retroStatistics.championship(
                championshipId,
                seasonId,
                competitionType,
              )
            : TELEGRAM_CALLBACKS.statistics.championship(
                championshipId,
                competitionType,
              ),
        });
      },
    );

    bot.action(
      [
        TELEGRAM_CALLBACK_PATTERNS.statistics.league,
        TELEGRAM_CALLBACK_PATTERNS.retroStatistics.league,
      ],
      async (context) => {
        const isRetro = context.match[0].startsWith('retro-statistics:');
        const leagueId = Number(context.match[1]);
        const stageId = Number(context.match[2]);
        const championshipId = Number(context.match[3]);
        const seasonId = isRetro ? Number(context.match[4]) : undefined;
        const competitionType = parseCompetitionType(
          context.match[isRetro ? 5 : 4],
        );
        const teams = await this.queries.findTeams(leagueId);

        await showList(context, {
          items: teams.map((team) => ({
            text: team.name,
            callbackData: seasonId
              ? TELEGRAM_CALLBACKS.retroStatistics.team(
                  team.id,
                  leagueId,
                  stageId,
                  championshipId,
                  seasonId,
                  competitionType,
                )
              : TELEGRAM_CALLBACKS.statistics.team(
                  team.id,
                  leagueId,
                  stageId,
                  championshipId,
                  competitionType,
                ),
          })),
          message: TELEGRAM_MESSAGES.teams.select,
          emptyMessage: TELEGRAM_MESSAGES.teams.empty,
          backText: '⬅️ К лигам',
          backCallbackData: seasonId
            ? TELEGRAM_CALLBACKS.retroStatistics.stage(
                stageId,
                championshipId,
                seasonId,
                competitionType,
              )
            : TELEGRAM_CALLBACKS.statistics.stage(
                stageId,
                championshipId,
                competitionType,
              ),
        });
      },
    );

    bot.action(
      [
        TELEGRAM_CALLBACK_PATTERNS.statistics.team,
        TELEGRAM_CALLBACK_PATTERNS.retroStatistics.team,
      ],
      async (context) => {
        const isRetro = context.match[0].startsWith('retro-statistics:');
        const teamId = Number(context.match[1]);
        const leagueId = Number(context.match[2]);
        const stageId = Number(context.match[3]);
        const championshipId = Number(context.match[4]);
        const seasonId = isRetro ? Number(context.match[5]) : undefined;
        const competitionType = parseCompetitionType(
          context.match[isRetro ? 6 : 5],
        );
        const statistics = await this.playersService.findTeamStatistics(
          teamId,
          leagueId,
        );
        const keyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback(
              TELEGRAM_MESSAGES.teams.back,
              seasonId
                ? TELEGRAM_CALLBACKS.retroStatistics.league(
                    leagueId,
                    stageId,
                    championshipId,
                    seasonId,
                    competitionType,
                  )
                : TELEGRAM_CALLBACKS.statistics.league(
                    leagueId,
                    stageId,
                    championshipId,
                    competitionType,
                  ),
            ),
          ],
        ]);

        await context.answerCbQuery();

        if (!statistics) {
          await context.editMessageText(
            TELEGRAM_MESSAGES.teams.statisticsEmpty,
            keyboard,
          );
          return;
        }

        const message = context.callbackQuery.message;

        if (!message) {
          return;
        }

        const editRichMessage = context.telegram.callApi.bind(
          context.telegram,
        ) as unknown as (
          method: string,
          payload: Record<string, unknown>,
        ) => Promise<unknown>;

        await editRichMessage('editMessageText', {
          chat_id: message.chat.id,
          message_id: message.message_id,
          rich_message: { html: formatTeamStatistics(statistics) },
          reply_markup: keyboard.reply_markup,
        });
      },
    );
  }
}
