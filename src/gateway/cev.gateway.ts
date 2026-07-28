import { Injectable } from '@nestjs/common';
import { ChampionshipsEntity } from '../databases/entities/championships.entity';
import { SeasonsEntity } from '../databases/entities/seasons.entity';
import { FetchedChampionships } from '../interfaces/requests/championships.interface';
import { FetchedLeagueCatalog } from '../interfaces/requests/leagues.interface';
import { IFetchedMatches } from '../interfaces/requests/matches.interface';
import { FetchedPlayers } from '../interfaces/requests/players.interface';
import {
  FetchedSeasons,
  ICevSeason,
} from '../interfaces/requests/seasons.interface';
import { PlayerRosterSource } from '../interfaces/responses/synchronized-teams.interface';
import { extractChampionships } from '../shared/cev-championships.utils';
import { extractLeagues } from '../shared/cev-leagues.utils';
import { extractMatches } from '../shared/cev-matches.utils';
import { extractPlayers } from '../shared/cev-players.utils';
import { extractTeams } from '../shared/cev-teams.utils';
import {
  createCalendarForm,
  extractCalendarSeasons,
  getCalendarMetadata,
} from '../shared/cev-calendar.utils';
import {
  CEV_HTTP_CONCURRENCY,
  CEV_CALENDAR_URL,
  createCompetitionUrl,
  createMatchesUrl,
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
  constructor(private readonly http: HttpService) {}

  async fetchSeasonsSince(earliestYear: number): Promise<FetchedSeasons> {
    const initialHtml = await this.http.get(CEV_CALENDAR_URL);

    const { availableYears, selectedYear } = getCalendarMetadata(initialHtml);

    const requestedYears = availableYears.filter(
      (year) => year >= earliestYear,
    );

    const requests = requestedYears.map((year) =>
      year === selectedYear
        ? Promise.resolve(initialHtml)
        : this.fetchCalendarYear(initialHtml, year),
    );

    const results = await Promise.allSettled(requests);
    const seasons = new Map<number, ICevSeason>();

    for (const result of results) {
      if (result.status === 'rejected') {
        continue;
      }

      for (const season of extractCalendarSeasons(result.value)) {
        seasons.set(season.externalId, season);
      }
    }

    return {
      seasons: [...seasons.values()],
      isComplete: results.every((result) => result.status === 'fulfilled'),
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

  async fetchPlayers(sources: PlayerRosterSource[]): Promise<FetchedPlayers> {
    const results = await this.mapSettled({
      items: sources,
      mapper: async ({ team, season }) =>
        extractPlayers({
          html: await this.http.get(
            createTeamUrl(team.externalId, season.externalId),
          ),
          teamExternalId: team.externalId,
          seasonExternalId: season.externalId,
        }),
      concurrency: 5,
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

  private fetchCalendarYear(
    initialHtml: string,
    year: number,
  ): Promise<string> {
    const form = createCalendarForm(initialHtml, year);

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
