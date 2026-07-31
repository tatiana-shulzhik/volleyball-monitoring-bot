import { Injectable, Logger } from '@nestjs/common';
import { ChampionshipsEntity } from '../databases/entities/championships.entity';
import { CompetitionStagesEntity } from '../databases/entities/competition-stages.entity';
import { MatchEntity } from '../databases/entities/match.entity';
import {
  FetchedCompetitionStages,
  ICevCompetitionStage,
} from '../interfaces/requests/competition-stages.interface';
import { FetchedLeagueCatalog } from '../interfaces/requests/leagues.interface';
import { IFetchedMatches } from '../interfaces/requests/matches.interface';
import { IFetchedPlayers } from '../interfaces/requests/players.interface';
import {
  IFetchedMatchAttackStatistics,
  IFetchedPlayerStatistics,
} from '../interfaces/requests/player-statistics.interface';
import { ICevChampionship } from '../interfaces/requests/championships.interface';
import { IFetchedSeasonCatalog } from '../interfaces/requests/seasons.interface';
import { IPlayerRosterSource } from '../interfaces/responses/synchronized-teams.interface';
import { extractChampionships } from '../shared/cev-championships.utils';
import { extractLeagues } from '../shared/cev-leagues.utils';
import { extractMatches } from '../shared/cev-matches.utils';
import { extractPlayers } from '../shared/cev-players.utils';
import {
  extractPlayerAttackStatistics,
  extractPlayerStatistics,
} from '../shared/cev-player-statistics.utils';
import {
  createStatisticsPhaseForm,
  getStatisticsPhaseIds,
} from '../shared/cev-player-statistics.utils';
import { extractTeams } from '../shared/cev-teams.utils';
import { getErrorMessage } from '../shared/error.utils';
import {
  createCalendarForm,
  createNationalTeamCalendarForm,
  extractCalendarChampionships,
  getCalendarMetadata,
} from '../shared/cev-calendar.utils';
import { ECompetitionType } from '../shared/enums';
import { parseSeasonEndYear } from '../shared/season.utils';
import {
  CEV_HTTP_CONCURRENCY,
  CEV_CALENDAR_URL,
  createCompetitionUrl,
  createMatchesUrl,
  createMatchStatisticsUrl,
  createPlayerStatisticsUrl,
  createTeamUrl,
} from '../shared/consts/constants';
import { HttpService } from '../shared/http/http.service';

interface IMapSettledParams<TInput, TOutput> {
  items: TInput[];
  mapper: (item: TInput) => Promise<TOutput>;
  concurrency: number;
}

@Injectable()
export class CevGateway {
  private readonly logger = new Logger(CevGateway.name);

  constructor(private readonly http: HttpService) {}

  async fetchSeasonCatalogSince(
    earliestYear: number,
  ): Promise<IFetchedSeasonCatalog> {
    const initialHtml = await this.http.get(CEV_CALENDAR_URL);
    const calendarResults = await Promise.allSettled([
      Promise.resolve({
        html: initialHtml,
        competitionType: ECompetitionType.Club,
      }),
      this.fetchNationalTeamCalendar(initialHtml).then((html) => ({
        html,
        competitionType: ECompetitionType.NationalTeam,
      })),
    ]);
    const requests = calendarResults.flatMap((calendarResult) => {
      if (calendarResult.status === 'rejected') {
        return [];
      }

      const { html, competitionType } = calendarResult.value;
      const { availableYears, selectedYear } = getCalendarMetadata(html);

      return availableYears
        .filter((year) => year >= earliestYear)
        .map((year) =>
          (year === selectedYear
            ? Promise.resolve(html)
            : this.fetchCalendarYear(html, year)
          ).then((yearHtml) => ({
            html: yearHtml,
            competitionType,
            calendarYear: year,
          })),
        );
    });
    const results = await Promise.allSettled(requests);
    const championships = new Map<number, ICevChampionship>();
    const stages = new Map<string, ICevCompetitionStage>();

    for (const result of results) {
      if (result.status === 'rejected') {
        continue;
      }

      const extracted = extractCalendarChampionships(
        result.value.html,
        result.value.competitionType,
        result.value.calendarYear,
      );

      for (const championship of extracted.championships) {
        championships.set(championship.externalId, championship);
      }

      for (const stage of extracted.stages) {
        const key = `${stage.championshipExternalId}:${stage.externalId}`;
        const existing = stages.get(key);

        if (
          existing &&
          (parseSeasonEndYear(existing.seasonName) ?? 0) <
            (parseSeasonEndYear(stage.seasonName) ?? 0)
        ) {
          continue;
        }

        stages.set(key, stage);
      }
    }

    return {
      championships: [...championships.values()],
      stages: [...stages.values()],
      isComplete:
        calendarResults.every((result) => result.status === 'fulfilled') &&
        results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchCompetitionStages(
    championships: ChampionshipsEntity[],
  ): Promise<FetchedCompetitionStages> {
    const results = await this.mapSettled({
      items: championships,
      mapper: async (championship) =>
        extractChampionships(
          await this.http.get(createCompetitionUrl(championship.externalId)),
          championship.externalId,
        ),
      concurrency: 5,
    });

    return {
      stages: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      ),
      isComplete: results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchLeagueCatalog(
    stages: CompetitionStagesEntity[],
  ): Promise<FetchedLeagueCatalog> {
    const results = await this.mapSettled({
      items: stages,
      mapper: async (stage) => {
        const html = await this.http.get(
          createCompetitionUrl(stage.championship.externalId, stage.externalId),
        );
        const leagues = extractLeagues(html, stage.externalId);

        return {
          leagues,
          teams: extractTeams(html, leagues),
        };
      },
      concurrency: 5,
    });

    return {
      leagues: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value.leagues : [],
      ),
      teams: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value.teams : [],
      ),
      isComplete: results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchPlayers(sources: IPlayerRosterSource[]): Promise<IFetchedPlayers> {
    const sourceGroups = [
      ...sources
        .reduce((groups, source) => {
          const key = `${source.team.externalId}:${source.championship.externalId}`;
          const group = groups.get(key) ?? [];

          group.push(source);
          groups.set(key, group);
          return groups;
        }, new Map<string, IPlayerRosterSource[]>())
        .values(),
    ];
    const results = await this.mapSettled({
      items: sourceGroups,
      mapper: async (group) => {
        const { team, league, championship } = group[0];
        const roster = extractPlayers({
          html: await this.http.get(
            createTeamUrl(team.externalId, championship.externalId),
          ),
          teamExternalId: team.externalId,
          leagueExternalId: league.externalId,
        });

        return group.flatMap((source) =>
          roster.map((player) => ({
            ...player,
            leagueExternalId: source.league.externalId,
          })),
        );
      },
      concurrency: CEV_HTTP_CONCURRENCY,
    });

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        return;
      }

      const { team, championship } = sourceGroups[index][0];
      const url = createTeamUrl(team.externalId, championship.externalId);

      this.logger.warn(
        `Player roster request failed for "${team.name}" ` +
          `in "${championship.name}" (${url}): ${getErrorMessage(result.reason)}`,
      );
    });

    return {
      players: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      ),
      isComplete: results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchMatches(
    stages: CompetitionStagesEntity[],
  ): Promise<IFetchedMatches> {
    const results = await this.mapSettled({
      items: stages,
      mapper: async (stage) =>
        extractMatches(
          await this.http.get(
            createMatchesUrl(stage.championship.externalId, stage.externalId),
          ),
        ),
      concurrency: CEV_HTTP_CONCURRENCY,
    });

    return {
      matches: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      ),
      isComplete: results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchPlayerStatistics(
    stages: CompetitionStagesEntity[],
  ): Promise<PromiseSettledResult<IFetchedPlayerStatistics>[]> {
    const championshipPages = new Map<number, Promise<string>>();

    return this.mapSettled({
      items: stages,
      mapper: async (stage) => {
        const championshipExternalId = stage.championship.externalId;
        let page = championshipPages.get(championshipExternalId);

        if (!page) {
          page = this.http.get(
            createPlayerStatisticsUrl(championshipExternalId),
          );
          championshipPages.set(championshipExternalId, page);
        }

        const html = await page;

        if (!getStatisticsPhaseIds(html).has(stage.externalId)) {
          throw new Error(
            `Statistics phase ${stage.externalId} is unavailable ` +
              `for championship ${championshipExternalId}`,
          );
        }

        const phaseHtml = await this.http.postForm(
          createPlayerStatisticsUrl(championshipExternalId),
          createStatisticsPhaseForm(html, stage.externalId),
        );

        return {
          championshipExternalId,
          stageExternalId: stage.externalId,
          statistics: extractPlayerStatistics(phaseHtml),
        };
      },
      concurrency: CEV_HTTP_CONCURRENCY,
    });
  }

  async fetchMatchAttackStatistics(
    matches: MatchEntity[],
  ): Promise<PromiseSettledResult<IFetchedMatchAttackStatistics>[]> {
    return this.mapSettled({
      items: matches,
      mapper: async (match) => {
        const html = await this.http.get(
          createMatchStatisticsUrl(match.externalId),
        );

        return {
          matchExternalId: match.externalId,
          home: extractPlayerAttackStatistics(html, 'casa'),
          away: extractPlayerAttackStatistics(html, 'ospiti'),
        };
      },
      concurrency: CEV_HTTP_CONCURRENCY,
    });
  }

  private fetchCalendarYear(
    initialHtml: string,
    year: number,
  ): Promise<string> {
    const form = createCalendarForm(initialHtml, year);

    return this.http.postForm(CEV_CALENDAR_URL, form);
  }

  private fetchNationalTeamCalendar(initialHtml: string): Promise<string> {
    const form = createNationalTeamCalendarForm(initialHtml);

    return this.http.postForm(CEV_CALENDAR_URL, form);
  }

  private async mapSettled<TInput, TOutput>(
    data: IMapSettledParams<TInput, TOutput>,
  ): Promise<PromiseSettledResult<TOutput>[]> {
    const { items, mapper, concurrency } = data;
    const results = new Array<PromiseSettledResult<TOutput>>(items.length);
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;

        try {
          results[index] = {
            status: 'fulfilled',
            value: await mapper(items[index]),
          };
        } catch (reason: unknown) {
          results[index] = { status: 'rejected', reason };
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, worker),
    );

    return results;
  }
}
