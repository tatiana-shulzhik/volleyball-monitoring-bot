import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Context, Telegraf } from 'telegraf';
import { LessThan } from 'typeorm';
import { TelegramConfig } from '../../configs/telegram.config';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { MatchesRepository } from '../../databases/repositories/matches.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { SourcesRepository } from '../../databases/repositories/sources.repository';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import { TelegramAccessRepository } from '../../databases/repositories/telegram-access.repository';
import {
  AGGREGATED_SEASONS_COUNT,
  MOSCOW_TIME_ZONE,
  PREVIOUS_YEARS_COUNT,
} from '../../shared/consts/constants';
import { ECompetitionType, ESourceCode } from '../../shared/enums';
import { getErrorMessage } from '../../shared/error.utils';
import { parseSeasonEndYear } from '../../shared/season.utils';
import {
  TELEGRAM_CALLBACK_PATTERNS,
  TELEGRAM_CALLBACKS,
} from '../../shared/telegram-callbacks';
import {
  createLiveMatchesFooter,
  createTodayMatchesKeyboard,
  SOURCE_MENU,
} from '../../shared/telegram-menu.utils';
import {
  editTelegramRichMessage,
  isTelegramMenuCommand,
} from '../../shared/telegram.utils';
import { TELEGRAM_MESSAGES } from './telegram.constants';
import { TelegramStatisticsHandlers } from './telegram-statistics.handlers';
import { IFindRecentSeasonsFromParams } from '../../interfaces/requests/seasons.interface';
import {
  formatTodayMatches,
  getMoscowDayBounds,
} from '../../shared/telegram-today-matches.utils';

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
    private readonly accessRepository: TelegramAccessRepository,
    private readonly matchesRepository: MatchesRepository,
    private readonly sourcesRepository: SourcesRepository,
    private readonly seasonsRepository: SeasonsRepository,
    private readonly championshipsRepository: ChampionshipsRepository,
    private readonly stagesRepository: CompetitionStagesRepository,
    private readonly teamLeaguesRepository: TeamLeaguesRepository,
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
    if (!this.isRunning) return;

    this.bot.stop(signal ?? 'Application shutdown');
    this.isRunning = false;
    this.logger.log('Telegram bot stopped');
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'daily-today-matches-notification',
    timeZone: MOSCOW_TIME_ZONE,
    waitForCompletion: true,
  })
  async sendTodayMatchesByCron(): Promise<void> {
    const sources =
      await this.sourcesRepository.findWithLiveMatchesNotifications();

    for (const source of sources) {
      await this.sendTodayMatches(this.config.groupId, source.code);
    }
  }

  async sendTodayMatches(
    chatId: number,
    sourceCode: ESourceCode,
  ): Promise<void> {
    try {
      const { html, matches } = await this.getTodayMatches(sourceCode);
      if (!html.trim()) return;

      const sendRichMessage = this.bot.telegram.callApi.bind(
        this.bot.telegram,
      ) as unknown as (
        method: string,
        payload: Record<string, unknown>,
      ) => Promise<unknown>;

      await sendRichMessage('sendRichMessage', {
        chat_id: chatId,
        rich_message: { html },
        reply_markup: createTodayMatchesKeyboard(matches).reply_markup,
      });
    } catch (error) {
      this.logger.error(
        'Unable to send today matches notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async sendRosterMonitoringNotification(message: string): Promise<boolean> {
    try {
      await this.bot.telegram.sendMessage(this.config.groupId, message);
      return true;
    } catch (error) {
      this.logger.error(
        'Unable to send roster monitoring notification',
        error instanceof Error ? error.stack : String(error),
      );
      return false;
    }
  }

  private registerHandlers(): void {
    this.bot.use(async (context, next) => {
      if (context.chat?.type !== 'private') return;

      if (await this.isAllowed(context.from?.username)) {
        await next();
        return;
      }

      if (context.callbackQuery) {
        await context.answerCbQuery(TELEGRAM_MESSAGES.access.denied, {
          show_alert: true,
        });
      } else if (isTelegramMenuCommand(context)) {
        await context.reply(TELEGRAM_MESSAGES.access.denied);
      }
    });

    this.bot.command(['start', 'menu'], async (context) => {
      await context.reply(TELEGRAM_MESSAGES.sources.select, SOURCE_MENU);
    });

    this.bot.command('today', async (context) => {
      const chatId = context.chat?.id;
      if (chatId !== undefined) {
        await this.sendTodayMatches(
          chatId,
          this.statisticsHandlers.getSelectedSource(chatId),
        );
      }
    });

    this.bot.action(TELEGRAM_CALLBACKS.menu.live, async (context) => {
      await this.showLiveMatches(
        context,
        this.statisticsHandlers.getSelectedSource(context.chat?.id),
      );
    });

    this.bot.action(TELEGRAM_CALLBACK_PATTERNS.liveMatch, async (context) => {
      await context.answerCbQuery();
    });

    this.bot.action(
      TELEGRAM_CALLBACK_PATTERNS.liveMatchesNotification,
      async (context) => {
        const source =
          await this.sourcesRepository.toggleLiveMatchesNotification(
            context.match[1] as ESourceCode,
          );
        await context.answerCbQuery(
          source.liveMatchesNotificationEnabled
            ? 'Автоотправка включена'
            : 'Автоотправка выключена',
        );
        await this.showLiveMatches(context, source.code, false);
      },
    );

    this.statisticsHandlers.register(this.bot, this);

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

  private async showLiveMatches(
    context: Context,
    sourceCode: ESourceCode,
    answerCallback = true,
  ): Promise<void> {
    const source = await this.sourcesRepository.findByCodeOrFail(sourceCode);
    if (answerCallback) await context.answerCbQuery();

    const message = context.callbackQuery?.message;
    if (!message) return;

    const { html, matches } = await this.getTodayMatches(sourceCode);
    const keyboard = createTodayMatchesKeyboard(
      matches,
      createLiveMatchesFooter(source),
    );
    await editTelegramRichMessage(context, html, keyboard);
  }

  private isAllowed(username: string | undefined): Promise<boolean> {
    return username
      ? this.accessRepository.isAllowed(username.toLowerCase())
      : Promise.resolve(false);
  }

  async findCurrentSeasons(
    competitionType: ECompetitionType,
    sourceCode: ESourceCode,
  ): Promise<SeasonsEntity[]> {
    const season = await this.findCurrentSeason(competitionType, sourceCode);

    return season ? [season] : [];
  }

  async findFinishedSeasons(
    competitionType: ECompetitionType,
    sourceCode: ESourceCode,
  ): Promise<SeasonsEntity[]> {
    const [currentSeason, finishedSeasons] = await Promise.all([
      this.findCurrentSeason(competitionType, sourceCode),
      this.seasonsRepository.findFinished(
        new Date(),
        competitionType,
        sourceCode,
      ),
    ]);

    return finishedSeasons
      .filter(({ id }) => id !== currentSeason?.id)
      .slice(0, PREVIOUS_YEARS_COUNT);
  }

  async findRecentSeasons(
    competitionType: ECompetitionType,
    sourceCode: ESourceCode,
  ): Promise<SeasonsEntity[]> {
    const seasons = await this.seasonsRepository.getWhere({
      stages: {
        championship: { competitionType, source: { code: sourceCode } },
      },
    });

    return seasons
      .sort((left, right) => right.name.localeCompare(left.name))
      .slice(0, PREVIOUS_YEARS_COUNT);
  }

  async findRecentSeasonsFrom(
    data: IFindRecentSeasonsFromParams,
  ): Promise<SeasonsEntity[]> {
    const { seasonId, competitionType, sourceCode } = data;

    const seasons = await this.seasonsRepository.getWhere({
      stages: {
        championship: { competitionType, source: { code: sourceCode } },
      },
    });
    const selectedSeason = seasons.find(({ id }) => id === seasonId);

    if (!selectedSeason) return [];

    const selectedYear = parseSeasonEndYear(selectedSeason.name);

    if (selectedYear === undefined) return [selectedSeason];

    const nearbySeasons = seasons
      .filter(
        ({ id, name }) =>
          id !== selectedSeason.id && parseSeasonEndYear(name) !== undefined,
      )
      .sort((left, right) => {
        const leftYear = parseSeasonEndYear(left.name)!;
        const rightYear = parseSeasonEndYear(right.name)!;

        return (
          Math.abs(leftYear - selectedYear) -
            Math.abs(rightYear - selectedYear) || rightYear - leftYear
        );
      });

    return [selectedSeason, ...nearbySeasons].slice(
      0,
      AGGREGATED_SEASONS_COUNT,
    );
  }

  async findChampionships(
    competitionType: ECompetitionType,
    sourceCode: ESourceCode,
    seasonId?: number,
  ): Promise<ChampionshipsEntity[]> {
    const selectedSeasonId =
      seasonId ??
      (await this.findCurrentSeason(competitionType, sourceCode))?.id;

    if (selectedSeasonId === undefined) {
      return [];
    }

    const championships = await this.championshipsRepository.getWhere({
      competitionType,
      source: { code: sourceCode },
      stages: {
        season: { id: selectedSeasonId },
        ...(seasonId === undefined ? {} : { endsAt: LessThan(new Date()) }),
      },
    });

    return championships.sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async findStages(
    championshipId: number,
    competitionType: ECompetitionType,
    sourceCode: ESourceCode,
    seasonId?: number,
  ): Promise<CompetitionStagesEntity[]> {
    const selectedSeasonId =
      seasonId ??
      (await this.findCurrentSeason(competitionType, sourceCode))?.id;

    if (selectedSeasonId === undefined) {
      return [];
    }

    const stages = await this.stagesRepository.getWhere({
      championship: { id: championshipId, source: { code: sourceCode } },
      season: { id: selectedSeasonId },
    });

    return stages.sort((left, right) => left.name.localeCompare(right.name));
  }

  async findTeamsForStage(
    stageId: number,
  ): Promise<{ team: TeamEntity; leagueId: number }[]> {
    const relations = await this.teamLeaguesRepository.getWhere({
      league: { stage: { id: stageId } },
    });

    const uniqueTeams = new Map(
      relations.map(({ team, league }) => [
        team.name.trim().toLowerCase(),
        { team, leagueId: league.id },
      ]),
    );

    return [...uniqueTeams.values()].sort((left, right) =>
      left.team.name.localeCompare(right.team.name),
    );
  }

  private findCurrentSeason(
    competitionType: ECompetitionType,
    sourceCode: ESourceCode,
  ): Promise<SeasonsEntity | null> {
    return this.seasonsRepository.findLatestWithActiveMatches(
      new Date(),
      competitionType,
      sourceCode,
    );
  }

  private async getTodayMatches(sourceCode: ESourceCode): Promise<{
    html: string;
    matches: Awaited<ReturnType<MatchesRepository['findScheduledBetween']>>;
  }> {
    const { start, end } = getMoscowDayBounds();
    const matches = await this.matchesRepository.findScheduledBetween(
      start,
      end,
      sourceCode,
    );
    return { html: formatTodayMatches(matches, sourceCode), matches };
  }
}
