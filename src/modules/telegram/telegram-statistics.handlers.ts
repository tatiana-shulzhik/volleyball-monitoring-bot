import { Injectable } from '@nestjs/common';
import { Context, Markup, Telegraf } from 'telegraf';
import { RedisCacheService } from '../../cache/redis-cache.service';
import {
  CURRENT_MONITORING_PAGE_SIZE,
  TEAM_STATISTICS_CACHE_TTL_SECONDS,
} from '../../shared/consts/constants';
import { ECompetitionType, ESourceCode } from '../../shared/enums';
import {
  formatPlayerQuickStats,
  formatTeamStatistics,
  formatTeamStatisticsPages,
  normalizePlayerName,
} from '../../shared/player-statistics.utils';
import {
  parseCompetitionType,
  TELEGRAM_CALLBACK_PATTERNS,
  TELEGRAM_CALLBACKS,
} from '../../shared/telegram-callbacks';
import {
  createMainMenu,
  createSourceButton,
  formatChampionshipButton,
  formatCurrentMonitoringButton,
  formatMainMenuMessage,
  getAvailableCompetitionTypes,
  showList,
  SOURCE_MENU,
} from '../../shared/telegram-menu.utils';
import { editTelegramRichMessage } from '../../shared/telegram.utils';
import { PlayersService } from '../players/players.service';
import { MonitoringSubscriptionsService } from '../monitoring-subscriptions/monitoring-subscriptions.service';
import type { TelegramService } from './telegram.service';
import {
  COMPETITION_TYPE_BUTTONS,
  SOURCE_BUTTONS,
  TELEGRAM_MESSAGES,
} from './telegram.constants';

@Injectable()
export class TelegramStatisticsHandlers {
  private readonly selectedSources = new Map<number, ESourceCode>();
  private telegramService!: TelegramService;

  constructor(
    private readonly playersService: PlayersService,
    private readonly cache: RedisCacheService,
    private readonly monitoringSubscriptionsService: MonitoringSubscriptionsService,
  ) {}

  register(bot: Telegraf, telegramService: TelegramService): void {
    this.telegramService = telegramService;
    this.registerSourceSelection(bot);
    this.registerCurrentStatistics(bot);
    this.registerMonitoring(bot);
    this.registerCurrentMonitoring(bot);
    this.registerRetroStatistics(bot);
    this.registerCatalogNavigation(bot);
  }

  getSelectedSource(chatId: number | undefined): ESourceCode {
    return this.getSource(chatId);
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
        const seasons = await this.telegramService.findCurrentSeasons(
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
        const championships = await this.telegramService.findChampionships(
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

  private registerMonitoring(bot: Telegraf): void {
    bot.action(TELEGRAM_CALLBACKS.menu.monitoring, async (context) => {
      await showList(context, {
        items: getAvailableCompetitionTypes(
          this.getSource(context.chat?.id),
        ).map((competitionType) => ({
          text: COMPETITION_TYPE_BUTTONS[competitionType],
          callbackData:
            TELEGRAM_CALLBACKS.monitoring.competitionType(competitionType),
        })),
        message: TELEGRAM_MESSAGES.competitionTypes.select,
        emptyMessage: TELEGRAM_MESSAGES.error,
        backText: '⬅️ Назад',
        backCallbackData: TELEGRAM_CALLBACKS.menu.back,
      });
    });

    bot.action(
      TELEGRAM_CALLBACK_PATTERNS.monitoring.competitionType,
      async (context) => {
        const competitionType = parseCompetitionType(context.match[1]);
        const seasons = await this.telegramService.findCurrentSeasons(
          competitionType,
          this.getSource(context.chat?.id),
        );

        await showList(context, {
          items: seasons.map(({ name }) => ({
            text: name,
            callbackData: TELEGRAM_CALLBACKS.monitoring.season(competitionType),
          })),
          message: TELEGRAM_MESSAGES.seasons.select,
          emptyMessage: TELEGRAM_MESSAGES.seasons.empty,
          backText: '⬅️ К видам соревнований',
          backCallbackData: TELEGRAM_CALLBACKS.menu.monitoring,
        });
      },
    );

    bot.action(
      TELEGRAM_CALLBACK_PATTERNS.monitoring.season,
      async (context) => {
        await this.showMonitoringChampionships(
          context,
          parseCompetitionType(context.match[1]),
        );
      },
    );

    bot.action(
      TELEGRAM_CALLBACK_PATTERNS.monitoring.championship,
      async (context) => {
        await this.showMonitoringStages(
          context,
          Number(context.match[1]),
          parseCompetitionType(context.match[2]),
        );
      },
    );

    bot.action(TELEGRAM_CALLBACK_PATTERNS.monitoring.stage, async (context) => {
      const stageId = Number(context.match[1]);
      const championshipId = Number(context.match[2]);
      const competitionType = parseCompetitionType(context.match[3]);
      await this.showMonitoringTeams(context, {
        stageId,
        championshipId,
        competitionType,
      });
    });

    bot.action(TELEGRAM_CALLBACK_PATTERNS.monitoring.team, async (context) => {
      await this.showMonitoringPlayers(context, {
        teamId: Number(context.match[1]),
        leagueId: Number(context.match[2]),
        stageId: Number(context.match[3]),
        championshipId: Number(context.match[4]),
        competitionType: parseCompetitionType(context.match[5]),
      });
    });

    bot.action(
      TELEGRAM_CALLBACK_PATTERNS.monitoring.clearTeam,
      async (context) => {
        const options = {
          teamId: Number(context.match[1]),
          leagueId: Number(context.match[2]),
          stageId: Number(context.match[3]),
          championshipId: Number(context.match[4]),
          competitionType: parseCompetitionType(context.match[5]),
        };
        const removed = await this.monitoringSubscriptionsService.removeByTeam(
          options.teamId,
          options.leagueId,
          options.championshipId,
        );
        await context.answerCbQuery(
          removed
            ? `Очищено игроков: ${removed}`
            : 'У команды нет выбранных игроков',
        );
        await this.renderMonitoringPlayers(context, options);
      },
    );

    bot.action(
      TELEGRAM_CALLBACK_PATTERNS.monitoring.player,
      async (context) => {
        const options = {
          teamId: Number(context.match[2]),
          leagueId: Number(context.match[3]),
          stageId: Number(context.match[4]),
          championshipId: Number(context.match[5]),
          competitionType: parseCompetitionType(context.match[6]),
        };
        const subscribed = await this.monitoringSubscriptionsService.toggle(
          Number(context.match[1]),
          options.championshipId,
        );
        await context.answerCbQuery(
          subscribed
            ? 'Игрок добавлен в мониторинг'
            : 'Игрок удалён из мониторинга',
        );
        await this.renderMonitoringPlayers(context, options);
      },
    );
  }

  private registerCurrentMonitoring(bot: Telegraf): void {
    bot.action(
      TELEGRAM_CALLBACK_PATTERNS.currentMonitoring,
      async (context) => {
        await context.answerCbQuery();
        await this.renderCurrentMonitoring(
          context,
          this.getSource(context.chat?.id),
          Number(context.match[1] ?? 0),
        );
      },
    );

    bot.action(
      TELEGRAM_CALLBACK_PATTERNS.monitoring.removePlayer,
      async (context) => {
        await this.monitoringSubscriptionsService.remove(
          Number(context.match[1]),
          Number(context.match[2]),
        );
        await context.answerCbQuery('Игрок удалён из мониторинга');
        await this.renderCurrentMonitoring(
          context,
          this.getSource(context.chat?.id),
          Number(context.match[3] ?? 0),
        );
      },
    );

    bot.action(
      TELEGRAM_CALLBACK_PATTERNS.monitoring.removeAll,
      async (context) => {
        const removed = await this.monitoringSubscriptionsService.removeAll(
          context.match[1] as ESourceCode,
        );
        await context.answerCbQuery(
          removed ? `Удалено игроков: ${removed}` : 'В мониторинге нет игроков',
        );
        await this.renderCurrentMonitoring(
          context,
          context.match[1] as ESourceCode,
        );
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
        const seasons = await this.telegramService.findFinishedSeasons(
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
        const championships = await this.telegramService.findChampionships(
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
        const stages = await this.telegramService.findStages(
          championshipId,
          competitionType,
          this.getSource(context.chat?.id),
          seasonId,
        );

        if (
          this.getSource(context.chat?.id) ===
            ESourceCode.LegaVolleyFemminile &&
          stages.length === 1
        ) {
          await this.showTeams(context, {
            stageId: stages[0].id,
            championshipId,
            seasonId,
            competitionType,
            backText: '⬅️ К чемпионатам',
            backCallbackData: seasonId
              ? TELEGRAM_CALLBACKS.retroStatistics.season(
                  seasonId,
                  competitionType,
                )
              : TELEGRAM_CALLBACKS.statistics.season(competitionType),
          });
          return;
        }

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
        await this.showTeams(context, {
          stageId,
          championshipId,
          seasonId,
          competitionType,
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
        TELEGRAM_CALLBACK_PATTERNS.statistics.teamExpanded,
        TELEGRAM_CALLBACK_PATTERNS.retroStatistics.team,
        TELEGRAM_CALLBACK_PATTERNS.retroStatistics.teamSummary,
        TELEGRAM_CALLBACK_PATTERNS.retroStatistics.teamExpanded,
      ],
      async (context) => {
        const isRetro = context.match[0].startsWith('retro-statistics:');
        const isSummary = context.match[0].includes(':team-summary:');
        const isExpanded = context.match[0].includes(':team-expanded:');
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
          : isExpanded
            ? Number(context.match[isRetro ? 7 : 6] ?? 0)
            : 0;
        const source = this.getSource(context.chat?.id);
        const cacheKey = `team-statistics:${source}:${isExpanded ? 'summary-full-roster' : isSummary ? 'summary-current-roster' : 'season'}:${competitionType}:${teamId}:${leagueId}:${seasonId ?? 'current'}`;
        let pages = (await this.cache.get<string[]>(cacheKey)) ?? undefined;

        if (pages === undefined) {
          const statistics = await this.playersService.findTeamStatistics({
            teamId,
            leagueId,
            aggregateSeasons:
              isSummary || isExpanded
                ? isRetro && isExpanded
                  ? await this.telegramService.findRecentSeasonsFrom({
                      seasonId: seasonId!,
                      competitionType,
                      sourceCode: source,
                    })
                  : await this.telegramService.findRecentSeasons(
                      competitionType,
                      source,
                    )
                : undefined,
            includeHistoricalRoster: isExpanded,
          });

          pages = statistics
            ? isSummary || isExpanded
              ? formatTeamStatisticsPages(statistics, 12000, isExpanded)
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
        const createSummaryCallbackData = (page = 0) => {
          if (isRetro) {
            return isExpanded
              ? TELEGRAM_CALLBACKS.retroStatistics.teamExpanded(
                  teamId,
                  leagueId,
                  stageId,
                  championshipId,
                  seasonId!,
                  competitionType,
                  page,
                )
              : TELEGRAM_CALLBACKS.retroStatistics.teamSummary(
                  teamId,
                  leagueId,
                  stageId,
                  championshipId,
                  seasonId!,
                  competitionType,
                  page,
                );
          }

          return isExpanded
            ? TELEGRAM_CALLBACKS.statistics.teamExpanded(
                teamId,
                leagueId,
                stageId,
                championshipId,
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
        };
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
              isSummary || isExpanded
                ? '📅 Только выбранный сезон'
                : '📊 За 4 сезона',
              isSummary || isExpanded
                ? teamCallbackData
                : createSummaryCallbackData(),
            ),
          ],
          [
            Markup.button.callback(
              isExpanded
                ? '📊 Обычная статистика'
                : '📋 Расширенная статистика',
              isExpanded
                ? isRetro
                  ? TELEGRAM_CALLBACKS.retroStatistics.teamSummary(
                      teamId,
                      leagueId,
                      stageId,
                      championshipId,
                      seasonId!,
                      competitionType,
                    )
                  : TELEGRAM_CALLBACKS.statistics.teamSummary(
                      teamId,
                      leagueId,
                      stageId,
                      championshipId,
                      competitionType,
                    )
                : isRetro
                  ? TELEGRAM_CALLBACKS.retroStatistics.teamExpanded(
                      teamId,
                      leagueId,
                      stageId,
                      championshipId,
                      seasonId!,
                      competitionType,
                    )
                  : TELEGRAM_CALLBACKS.statistics.teamExpanded(
                      teamId,
                      leagueId,
                      stageId,
                      championshipId,
                      competitionType,
                    ),
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
            createSourceButton(),
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

        await editTelegramRichMessage(context, pages[page], keyboard);
      },
    );
  }

  private async showMonitoringChampionships(
    context: Context,
    competitionType: ECompetitionType,
    answerText?: string,
  ): Promise<void> {
    const championships = await this.telegramService.findChampionships(
      competitionType,
      this.getSource(context.chat?.id),
    );
    const championshipsWithSubscriptions =
      await this.monitoringSubscriptionsService.findChampionshipIdsWithSubscriptions(
        championships.map(({ id }) => id),
      );

    await showList(context, {
      items: championships.map(({ id, name }) => ({
        text: `${championshipsWithSubscriptions.has(id) ? '✅ ' : ''}${formatChampionshipButton(name)}`,
        callbackData: TELEGRAM_CALLBACKS.monitoring.championship(
          id,
          competitionType,
        ),
      })),
      message: TELEGRAM_MESSAGES.championships.select,
      emptyMessage: TELEGRAM_MESSAGES.championships.empty,
      backText: '⬅️ К сезонам',
      backCallbackData:
        TELEGRAM_CALLBACKS.monitoring.competitionType(competitionType),
      answerText,
    });
  }

  private async showMonitoringStages(
    context: Context,
    championshipId: number,
    competitionType: ECompetitionType,
  ): Promise<void> {
    const stages = await this.telegramService.findStages(
      championshipId,
      competitionType,
      this.getSource(context.chat?.id),
    );

    await showList(context, {
      items: stages.map(({ id, name }) => ({
        text: name,
        callbackData: TELEGRAM_CALLBACKS.monitoring.stage(
          id,
          championshipId,
          competitionType,
        ),
      })),
      message: TELEGRAM_MESSAGES.stages.select,
      emptyMessage: TELEGRAM_MESSAGES.stages.empty,
      backText: '⬅️ К чемпионатам',
      backCallbackData: TELEGRAM_CALLBACKS.monitoring.season(competitionType),
    });
  }

  private async showMonitoringTeams(
    context: Context,
    options: {
      stageId: number;
      championshipId: number;
      competitionType: ECompetitionType;
    },
    answerText?: string,
  ): Promise<void> {
    const teams = await this.telegramService.findTeamsForStage(options.stageId);
    const teamsWithSubscriptions =
      await this.monitoringSubscriptionsService.findTeamIdsWithSubscriptions(
        options.championshipId,
        options.stageId,
      );

    await showList(context, {
      items: teams.map(({ team, leagueId }) => ({
        text: `${teamsWithSubscriptions.has(team.id) ? '✅ ' : ''}${team.name}`,
        callbackData: TELEGRAM_CALLBACKS.monitoring.team(
          team.id,
          leagueId,
          options.stageId,
          options.championshipId,
          options.competitionType,
        ),
      })),
      message: TELEGRAM_MESSAGES.teams.select,
      emptyMessage: TELEGRAM_MESSAGES.teams.empty,
      backText: '⬅️ К этапам',
      backCallbackData: TELEGRAM_CALLBACKS.monitoring.championship(
        options.championshipId,
        options.competitionType,
      ),
      answerText,
    });
  }

  private async showMonitoringPlayers(
    context: Context,
    options: {
      teamId: number;
      leagueId: number;
      stageId: number;
      championshipId: number;
      competitionType: ECompetitionType;
    },
  ): Promise<void> {
    await context.answerCbQuery();
    await this.renderMonitoringPlayers(context, options);
  }

  private async renderCurrentMonitoring(
    context: Context,
    sourceCode: ESourceCode,
    requestedPage = 0,
  ): Promise<void> {
    const subscriptions =
      await this.monitoringSubscriptionsService.findAllForCurrentMonitoring(
        sourceCode,
      );
    const pageCount = Math.max(
      1,
      Math.ceil(subscriptions.length / CURRENT_MONITORING_PAGE_SIZE),
    );
    const page = Math.min(Math.max(requestedPage, 0), pageCount - 1);
    const pageSubscriptions = subscriptions.slice(
      page * CURRENT_MONITORING_PAGE_SIZE,
      (page + 1) * CURRENT_MONITORING_PAGE_SIZE,
    );
    const paginationButtons =
      subscriptions.length > CURRENT_MONITORING_PAGE_SIZE
        ? [
            [
              ...(page > 0
                ? [
                    Markup.button.callback(
                      `⬅️ ${page}/${pageCount}`,
                      TELEGRAM_CALLBACKS.menu.currentMonitoringPage(page - 1),
                    ),
                  ]
                : []),
              ...(page < pageCount - 1
                ? [
                    Markup.button.callback(
                      `${page + 2}/${pageCount} ➡️`,
                      TELEGRAM_CALLBACKS.menu.currentMonitoringPage(page + 1),
                    ),
                  ]
                : []),
            ],
          ]
        : [];
    const keyboard = Markup.inlineKeyboard([
      ...pageSubscriptions.map(
        ({
          playerId,
          playerName,
          shirtNumber,
          teamNames,
          championshipId,
          championshipName,
        }) => [
          Markup.button.callback(
            formatCurrentMonitoringButton(
              playerName,
              shirtNumber,
              teamNames,
              championshipName,
            ),
            TELEGRAM_CALLBACKS.monitoring.removePlayer(
              playerId,
              championshipId,
              page,
            ),
          ),
        ],
      ),
      ...paginationButtons,
      ...(subscriptions.length
        ? [
            [
              Markup.button.callback(
                '🟥 🗑 Удалить всё',
                TELEGRAM_CALLBACKS.monitoring.removeAll(sourceCode),
              ),
            ],
          ]
        : []),
      [
        Markup.button.callback('⬅️ Назад', TELEGRAM_CALLBACKS.menu.back),
        createSourceButton(),
      ],
    ]);

    await context.editMessageText(
      subscriptions.length
        ? `${SOURCE_BUTTONS[sourceCode]}\n\nТекущий мониторинг` +
            (pageCount > 1 ? ` (${page + 1}/${pageCount})` : '') +
            `. Нажмите на игрока, чтобы удалить его.`
        : `${SOURCE_BUTTONS[sourceCode]}\n\nВ мониторинге пока нет игроков.`,
      keyboard,
    );
  }

  private async renderMonitoringPlayers(
    context: Context,
    options: {
      teamId: number;
      leagueId: number;
      stageId: number;
      championshipId: number;
      competitionType: ECompetitionType;
    },
  ): Promise<void> {
    const [{ teamName, players }, teamStatistics] = await Promise.all([
      this.playersService.findTeamPlayers(options.teamId, options.leagueId),
      this.playersService.findTeamStatistics({
        teamId: options.teamId,
        leagueId: options.leagueId,
      }),
    ]);
    const statisticsByName = new Map(
      (teamStatistics?.players ?? []).map((player) => [
        normalizePlayerName(player.fullName),
        player,
      ]),
    );
    const monitoredPlayerIds =
      await this.monitoringSubscriptionsService.findPlayerIds(
        players.map(({ id }) => id),
        options.championshipId,
      );
    const keyboard = Markup.inlineKeyboard([
      ...players.map((player) => {
        const stats = formatPlayerQuickStats(
          statisticsByName.get(normalizePlayerName(player.fullName)),
        );
        const normalizedName = player.fullName.toLocaleLowerCase();
        const displayName =
          normalizedName.charAt(0).toLocaleUpperCase() + normalizedName.slice(1);
        const nameCharacters = Array.from(displayName);
        const prefix = `${monitoredPlayerIds.has(player.id) ? '✅' : '➕'} ${player.shirtNumber ?? '-'} `;
        const suffix = stats ? ` (${stats})` : '';
        const name =
          stats && nameCharacters.length > 12
            ? `${nameCharacters.slice(0, 12).join('').trimEnd()}...`
            : displayName;
        const label = prefix + name + suffix;

        return [
          Markup.button.callback(
            label,
            TELEGRAM_CALLBACKS.monitoring.player(
              player.id,
              options.teamId,
              options.leagueId,
              options.stageId,
              options.championshipId,
              options.competitionType,
            ),
          ),
        ];
      }),
      ...(monitoredPlayerIds.size
        ? [
            [
              Markup.button.callback(
                '🗑 Очистить выбранных',
                TELEGRAM_CALLBACKS.monitoring.clearTeam(
                  options.teamId,
                  options.leagueId,
                  options.stageId,
                  options.championshipId,
                  options.competitionType,
                ),
              ),
            ],
          ]
        : []),
      [
        Markup.button.callback(
          TELEGRAM_MESSAGES.teams.back,
          TELEGRAM_CALLBACKS.monitoring.stage(
            options.stageId,
            options.championshipId,
            options.competitionType,
          ),
        ),
        createSourceButton(),
      ],
    ]);

    const title = `🏐 ${teamName ?? 'Команда'}`;
    await context.editMessageText(
      players.length
        ? `${title}\n\n👤 (⭐ рейтинг = очки / партии; ⚡ атаки = успешные / все (процент))\n✅ — игрок в мониторинге.\n\nВыберите игрока для добавления или удаления из мониторинга:`
        : `${title}\n\n${TELEGRAM_MESSAGES.teams.statisticsEmpty}`,
      keyboard,
    );
  }

  private getSource(chatId: number | undefined): ESourceCode {
    return chatId === undefined
      ? ESourceCode.Cev
      : (this.selectedSources.get(chatId) ?? ESourceCode.Cev);
  }

  private async showTeams(
    context: Context,
    options: {
      stageId: number;
      championshipId: number;
      seasonId: number | undefined;
      competitionType: ECompetitionType;
      backText: string;
      backCallbackData: string;
    },
  ): Promise<void> {
    const teams = await this.telegramService.findTeamsForStage(options.stageId);

    await showList(context, {
      items: teams.map(({ team, leagueId }) => ({
        text: team.name,
        callbackData: options.seasonId
          ? TELEGRAM_CALLBACKS.retroStatistics.team(
              team.id,
              leagueId,
              options.stageId,
              options.championshipId,
              options.seasonId,
              options.competitionType,
            )
          : TELEGRAM_CALLBACKS.statistics.team(
              team.id,
              leagueId,
              options.stageId,
              options.championshipId,
              options.competitionType,
            ),
      })),
      message: TELEGRAM_MESSAGES.teams.select,
      emptyMessage: TELEGRAM_MESSAGES.teams.empty,
      backText: options.backText,
      backCallbackData: options.backCallbackData,
    });
  }
}
