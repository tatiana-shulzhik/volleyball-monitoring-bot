import { Injectable, Logger } from '@nestjs/common';
import { ChampionshipsEntity } from '../databases/entities/championships.entity';
import { SeasonsEntity } from '../databases/entities/seasons.entity';
import { FetchedChampionships } from '../interfaces/requests/championships.interface';
import { FetchedLeagueCatalog } from '../interfaces/requests/leagues.interface';
import { IFetchedMatches } from '../interfaces/requests/matches.interface';
import { IFetchedPlayers } from '../interfaces/requests/players.interface';
import { IFetchedPlayerStatistics } from '../interfaces/requests/player-statistics.interface';
import {
  FetchedSeasons,
  ICevSeason,
} from '../interfaces/requests/seasons.interface';
import { IPlayerRosterSource } from '../interfaces/responses/synchronized-teams.interface';
import { extractChampionships } from '../shared/cev-championships.utils';
import { extractLeagues } from '../shared/cev-leagues.utils';
import { extractMatches } from '../shared/cev-matches.utils';
import { extractPlayers } from '../shared/cev-players.utils';
import { extractPlayerStatistics } from '../shared/cev-player-statistics.utils';
import { extractTeams } from '../shared/cev-teams.utils';
import { getErrorMessage } from '../shared/error.utils';
import {
  createCalendarForm,
  createNationalTeamCalendarForm,
  extractCalendarSeasons,
  getCalendarMetadata,
} from '../shared/cev-calendar.utils';
import { ECompetitionType } from '../shared/enums';
import {
  CEV_HTTP_CONCURRENCY,
  CEV_CALENDAR_URL,
  createCompetitionUrl,
  createMatchesUrl,
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

  async fetchSeasonsSince(earliestYear: number): Promise<FetchedSeasons> {
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
          ).then((yearHtml) => ({ html: yearHtml, competitionType })),
        );
    });
    const results = await Promise.allSettled(requests);
    const seasons = new Map<number, ICevSeason>();

    for (const result of results) {
      if (result.status === 'rejected') {
        continue;
      }

      for (const season of extractCalendarSeasons(
        result.value.html,
        result.value.competitionType,
      )) {
        const existing = seasons.get(season.externalId);

        seasons.set(season.externalId, {
          ...season,
          startsAt:
            existing && existing.startsAt < season.startsAt
              ? existing.startsAt
              : season.startsAt,
          endsAt:
            existing && existing.endsAt > season.endsAt
              ? existing.endsAt
              : season.endsAt,
        });
      }
    }

    return {
      seasons: [...seasons.values()],
      isComplete:
        calendarResults.every((result) => result.status === 'fulfilled') &&
        results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchChampionships(
    seasons: SeasonsEntity[],
  ): Promise<FetchedChampionships> {
    const results = await this.mapSettled({
      items: seasons,
      mapper: async (season) =>
        extractChampionships(
          await this.http.get(createCompetitionUrl(season.externalId)),
          season.externalId,
        ),
      concurrency: 5,
    });

    return {
      championships: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      ),
      isComplete: results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchLeagueCatalog(
    championships: ChampionshipsEntity[],
  ): Promise<FetchedLeagueCatalog> {
    const results = await this.mapSettled({
      items: championships,
      mapper: async (championship) => {
        const html = await this.http.get(
          createCompetitionUrl(
            championship.season.externalId,
            championship.externalId,
          ),
        );
        const leagues = extractLeagues(html, championship.externalId);

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
          const key = `${source.team.externalId}:${source.season.externalId}`;
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
        const { team, league, season } = group[0];
        const roster = extractPlayers({
          html: await this.http.get(
            createTeamUrl(team.externalId, season.externalId),
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

      const { team, season } = sourceGroups[index][0];
      const url = createTeamUrl(team.externalId, season.externalId);

      this.logger.warn(
        `Player roster request failed for "${team.name}" ` +
          `in "${season.name}" (${url}): ${getErrorMessage(result.reason)}`,
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
    championships: ChampionshipsEntity[],
  ): Promise<IFetchedMatches> {
    const results = await this.mapSettled({
      items: championships,
      mapper: async (championship) =>
        extractMatches(
          await this.http.get(
            createMatchesUrl(
              championship.season.externalId,
              championship.externalId,
            ),
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
    seasons: SeasonsEntity[],
  ): Promise<PromiseSettledResult<IFetchedPlayerStatistics>[]> {
    const uniqueSeasons = [
      ...new Map(seasons.map((season) => [season.externalId, season])).values(),
    ];

    return this.mapSettled({
      items: uniqueSeasons,
      mapper: async (season) => ({
        seasonExternalId: season.externalId,
        statistics: extractPlayerStatistics(
          await this.http.get(createPlayerStatisticsUrl(season.externalId)),
        ),
      }),
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
