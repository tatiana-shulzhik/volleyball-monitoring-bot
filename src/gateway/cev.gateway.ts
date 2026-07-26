import { Injectable } from '@nestjs/common';
import { SeasonsEntity } from '../databases/entities/seasons.entity';
import { FetchedChampionships } from '../interfaces/requests/championships.interface';
import {
  FetchedSeasons,
  ICevSeason,
} from '../interfaces/requests/seasons.interface';
import { extractChampionships } from '../shared/cev-championships.utils';
import {
  createCalendarForm,
  extractCalendarSeasons,
  getCalendarMetadata,
} from '../shared/cev-calendar.utils';
import {
  CEV_CALENDAR_URL,
  createCompetitionUrl,
} from '../shared/consts/constants';
import { HttpService } from '../shared/http/http.service';

interface MapSettledParams<TInput, TOutput> {
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

  private fetchCalendarYear(
    initialHtml: string,
    year: number,
  ): Promise<string> {
    const form = createCalendarForm(initialHtml, year);

    return this.http.postForm(CEV_CALENDAR_URL, form);
  }

  private async mapSettled<TInput, TOutput>(
    data: MapSettledParams<TInput, TOutput>,
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
