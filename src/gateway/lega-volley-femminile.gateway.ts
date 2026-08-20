import { Injectable } from '@nestjs/common';
import {
  LEGA_VOLLEY_FEMMINILE_BASE_URL,
  LEGA_VOLLEY_FEMMINILE_CATALOG_PATH,
  LEGA_VOLLEY_FEMMINILE_RESULTS_PATH,
  LEGA_VOLLEY_FEMMINILE_SEASONS_PATH,
} from '../shared/consts/constants';
import { HttpService } from '../shared/http/http.service';
import {
  parseLegaVolleyFemminileCatalog,
  readLegaVolleyFemminileMatches,
  readLegaVolleyFemminileSeasons,
} from '../shared/lega-volley-femminile.utils';

@Injectable()
export class LegaVolleyFemminileGateway {
  constructor(private readonly http: HttpService) {}

  async fetchCatalogSince(earliestYear: number) {
    const catalogUrl = `${LEGA_VOLLEY_FEMMINILE_BASE_URL}${LEGA_VOLLEY_FEMMINILE_CATALOG_PATH}`;
    const firstHtml = await this.http.get(
      `${LEGA_VOLLEY_FEMMINILE_BASE_URL}${LEGA_VOLLEY_FEMMINILE_SEASONS_PATH}`,
    );
    const seasons = readLegaVolleyFemminileSeasons(firstHtml, earliestYear);
    const pages = await Promise.all(
      seasons.map(async (season) => ({
        season,
        html: await this.http.get(`${catalogUrl}?stagione=${season.year}`),
      })),
    );

    const catalog = parseLegaVolleyFemminileCatalog(pages);
    const scheduleResults = await Promise.all(
      catalog.competitions.map(async (competition) => {
        const query =
          `?serie=0&campionato=${competition.externalId}` +
          `&stagione=${competition.seasonYear}&giornata=tutte`;
        const [resultsHtml, calendarHtml] = await Promise.all([
          this.http.get(
            `${LEGA_VOLLEY_FEMMINILE_BASE_URL}${LEGA_VOLLEY_FEMMINILE_RESULTS_PATH}${query}`,
          ),
          this.http.get(`${catalogUrl}${query}`),
        ]);
        return [resultsHtml, calendarHtml].map((html) =>
          readLegaVolleyFemminileMatches(html, competition.externalId),
        );
      }),
    );
    const fetched = scheduleResults.flat();
    const matches = new Map(
      fetched
        .flatMap((result) => result.matches)
        .map((match) => [match.externalId, match]),
    );
    for (const result of fetched) {
      for (const match of result.matches) {
        const existing = matches.get(match.externalId);
        if (!existing || match.status === 'finished') {
          matches.set(match.externalId, match);
        }
      }
    }

    return {
      ...catalog,
      teams: fetched.flatMap((result) => result.teams),
      matches: [...matches.values()],
    };
  }
}
