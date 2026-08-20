import { Injectable } from '@nestjs/common';
import { Markup, Telegraf } from 'telegraf';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { TEAM_STATISTICS_CACHE_TTL_SECONDS } from '../../shared/consts/constants';
import { ECompetitionType, ESourceCode } from '../../shared/enums';
import {
  formatTeamStatistics,
  formatTeamStatisticsPages,
} from '../../shared/player-statistics.utils';
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
import {
  createMainMenu,
  formatChampionshipButton,
  formatMainMenuMessage,
  getAvailableCompetitionTypes,
  showList,
  SOURCE_MENU,
} from './telegram-menu.utils';

@Injectable()
export class TelegramStatisticsHandlers {
  private readonly selectedSources = new Map<number, ESourceCode>();

  constructor(
    private readonly queries: TelegramStatisticsQueryService,
    private readonly playersService: PlayersService,
    private readonly cache: RedisCacheService,
  ) {}

  register(bot: Telegraf): void {
    this.registerSourceSelection(bot);
    this.registerCurrentStatistics(bot);
    this.registerRetroStatistics(bot);
    this.registerCatalogNavigation(bot);
  }

  private registerSourceSelection(bot: Telegraf): void {
    bot.action(TELEGRAM_CALLBACKS.menu.source, async (context) => {
      await context.answerCbQuery();
      await context.editMessageText(
        TELEGRAM_MESSAGES.sources.select,
        SOURCE_MENU,
      );
    });

    bot.action(TELEGRAM_CALLBACK_PATTERNS.source, async (context) => {
      const source = context.match[1] as ESourceCode;

      const chatId = context.chat?.id;

      if (chatId !== undefined) {
        this.selectedSources.set(chatId, source);
      }

      await context.answerCbQuery();
      await context.editMessageText(
        formatMainMenuMessage(source),
        createMainMenu(),
      );
    });

    bot.action(TELEGRAM_CALLBACKS.menu.back, async (context) => {
      const source = this.getSource(context.chat?.id);

      await context.answerCbQuery();
      await context.editMessageText(
        formatMainMenuMessage(source),
        createMainMenu(),
      );
    });
  }

  private registerCurrentStatistics(bot: Telegraf): void {
    bot.action(TELEGRAM_CALLBACKS.menu.statistics, async (context) => {
      await showList(context, {
        items: getAvailableCompetitionTypes(
          this.getSource(context.chat?.id),
        ).map((competitionType) => ({
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
        const seasons = await this.queries.findCurrentSeasons(
          competitionType,
          this.getSource(context.chat?.id),
        );

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
        const championships = await this.queries.findChampionships(
          competitionType,
          this.getSource(context.chat?.id),
        );

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
        items: getAvailableCompetitionTypes(
          this.getSource(context.chat?.id),
        ).map((competitionType) => ({
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
        const seasons = await this.queries.findFinishedSeasons(
          competitionType,
          this.getSource(context.chat?.id),
        );

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
          this.getSource(context.chat?.id),
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
          this.getSource(context.chat?.id),
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
        const teams = await this.queries.findTeamsForStage(stageId);

        await showList(context, {
          items: teams.map(({ team, leagueId }) => ({
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
        TELEGRAM_CALLBACK_PATTERNS.statistics.team,
        TELEGRAM_CALLBACK_PATTERNS.statistics.teamSummary,
        TELEGRAM_CALLBACK_PATTERNS.retroStatistics.team,
        TELEGRAM_CALLBACK_PATTERNS.retroStatistics.teamSummary,
      ],
      async (context) => {
        const isRetro = context.match[0].startsWith('retro-statistics:');
        const isSummary = context.match[0].includes(':team-summary:');
        const teamId = Number(context.match[1]);
        const leagueId = Number(context.match[2]);
        const stageId = Number(context.match[3]);
        const championshipId = Number(context.match[4]);
        const seasonId = isRetro ? Number(context.match[5]) : undefined;
        const competitionType = parseCompetitionType(
          context.match[isRetro ? 6 : 5],
        );
        const requestedPage = isSummary
          ? Number(context.match[isRetro ? 7 : 6] ?? 0)
          : 0;
        const source = this.getSource(context.chat?.id);
        const cacheKey = `team-statistics:${source}:${isSummary ? 'summary-current-roster' : 'season'}:${competitionType}:${teamId}:${leagueId}`;
        let pages = (await this.cache.get<string[]>(cacheKey)) ?? undefined;

        if (pages === undefined) {
          const statistics = await this.playersService.findTeamStatistics(
            teamId,
            leagueId,
            isSummary
              ? await this.queries.findRecentSeasons(competitionType, source)
              : undefined,
          );

          pages = statistics
            ? isSummary
              ? formatTeamStatisticsPages(statistics)
              : [formatTeamStatistics(statistics)]
            : [];

          await this.cache.set(
            cacheKey,
            pages,
            TEAM_STATISTICS_CACHE_TTL_SECONDS,
          );
        }
        const teamCallbackData = isRetro
          ? TELEGRAM_CALLBACKS.retroStatistics.team(
              teamId,
              leagueId,
              stageId,
              championshipId,
              seasonId!,
              competitionType,
            )
          : TELEGRAM_CALLBACKS.statistics.team(
              teamId,
              leagueId,
              stageId,
              championshipId,
              competitionType,
            );
        const createSummaryCallbackData = (page = 0) =>
          isRetro
            ? TELEGRAM_CALLBACKS.retroStatistics.teamSummary(
                teamId,
                leagueId,
                stageId,
                championshipId,
                seasonId!,
                competitionType,
                page,
              )
            : TELEGRAM_CALLBACKS.statistics.teamSummary(
                teamId,
                leagueId,
                stageId,
                championshipId,
                competitionType,
                page,
              );
        const page = pages.length
          ? Math.min(Math.max(requestedPage, 0), pages.length - 1)
          : 0;
        const paginationButtons =
          pages.length > 1
            ? [
                [
                  ...(page > 0
                    ? [
                        Markup.button.callback(
                          `⬅️ ${page}/${pages.length}`,
                          createSummaryCallbackData(page - 1),
                        ),
                      ]
                    : []),
                  ...(page < pages.length - 1
                    ? [
                        Markup.button.callback(
                          `${page + 2}/${pages.length} ➡️`,
                          createSummaryCallbackData(page + 1),
                        ),
                      ]
                    : []),
                ],
              ]
            : [];
        const keyboard = Markup.inlineKeyboard([
          [
            Markup.button.callback(
              isSummary ? '📅 Только выбранный сезон' : '📊 За 4 сезона',
              isSummary ? teamCallbackData : createSummaryCallbackData(),
            ),
          ],
          ...paginationButtons,
          [
            Markup.button.callback(
              TELEGRAM_MESSAGES.teams.back,
              seasonId
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
            ),
          ],
        ]);

        await context.answerCbQuery();

        if (!pages.length) {
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
          rich_message: { html: pages[page] },
          reply_markup: keyboard.reply_markup,
        });
      },
    );
  }

  private getSource(chatId: number | undefined): ESourceCode {
    return chatId === undefined
      ? ESourceCode.Cev
      : (this.selectedSources.get(chatId) ?? ESourceCode.Cev);
  }
}
