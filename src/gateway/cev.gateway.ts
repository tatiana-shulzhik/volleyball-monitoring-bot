import { Injectable } from '@nestjs/common';
import {
  FetchedSeasons,
  ICevSeason,
} from '../interfaces/requests/seasons.interface';
import {
  createCalendarForm,
  extractCalendarSeasons,
  getCalendarMetadata,
} from '../shared/cev-calendar.utils';
import { CEV_CALENDAR_URL } from '../shared/consts/constants';
import { HttpService } from '../shared/http/http.service';

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

  private fetchCalendarYear(
    initialHtml: string,
    year: number,
  ): Promise<string> {
    const form = createCalendarForm(initialHtml, year);

    return this.http.postForm(CEV_CALENDAR_URL, form);
  }
}
