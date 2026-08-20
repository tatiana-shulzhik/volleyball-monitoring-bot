import { Injectable, Logger } from '@nestjs/common';
import {
  ILegaVolleyFemminileMatchRoster,
  ILegaVolleyFemminileMatchStatistics,
} from '../interfaces/requests/lega-volley-femminile.interface';
import {
  LEGA_VOLLEY_FEMMINILE_BASE_URL,
  LEGA_VOLLEY_FEMMINILE_CATALOG_PATH,
  LEGA_VOLLEY_FEMMINILE_RESULTS_PATH,
  LEGA_VOLLEY_FEMMINILE_SEASONS_PATH,
  LEGA_VOLLEY_FEMMINILE_STATISTICS_URL,
  LEGA_VOLLEY_HTTP_CONCURRENCY,
  LEGA_VOLLEY_HTTP_TIMEOUT_MS,
} from '../shared/consts/constants';
import { HttpService } from '../shared/http/http.service';
import { splitIntoBatches } from '../shared/array.utils';
import { getErrorMessage } from '../shared/error.utils';
import {
  parseLegaVolleyFemminileCatalog,
  parseLegaVolleyFemminileMatchRoster,
  parseLegaVolleyFemminileMatchStatistics,
  readLegaVolleyFemminileMatches,
  readLegaVolleyFemminileSeasons,
} from '../shared/lega-volley-femminile.utils';

@Injectable()
export class LegaVolleyFemminileGateway {
  private readonly logger = new Logger(LegaVolleyFemminileGateway.name);

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
    const matchesByLeagueExternalId = new Map<number, Date[]>();
    for (const match of matches.values()) {
      if (!match.scheduledAt) continue;

      const dates = matchesByLeagueExternalId.get(match.leagueExternalId) ?? [];
      dates.push(match.scheduledAt);
      matchesByLeagueExternalId.set(match.leagueExternalId, dates);
    }
    for (const league of catalog.leagues) {
      const dates = matchesByLeagueExternalId.get(league.externalId);
      if (!dates?.length) continue;

      const stage = catalog.stages.find(
        (item) =>
          item.externalId === league.stageExternalId &&
          item.championshipExternalId === league.championshipExternalId,
      );
      if (!stage) continue;

      stage.startsAt = new Date(
        Math.min(...dates.map((date) => date.getTime())),
      );
      stage.endsAt = new Date(Math.max(...dates.map((date) => date.getTime())));
    }

    return {
      ...catalog,
      teams: fetched.flatMap((result) => result.teams),
      matches: [...matches.values()],
    };
  }

  async fetchMatchStatistics(
    matchExternalIds: string[],
  ): Promise<ILegaVolleyFemminileMatchStatistics[]> {
    const sourceMatchIds = matchExternalIds.flatMap((externalId) => {
      const sourceMatchId = externalId.match(
        /^legavolley_femminile:(\d+)$/,
      )?.[1];
      return sourceMatchId ? [sourceMatchId] : [];
    });
    const statistics: ILegaVolleyFemminileMatchStatistics[] = [];

    for (const batch of splitIntoBatches(
      sourceMatchIds,
      LEGA_VOLLEY_HTTP_CONCURRENCY,
    )) {
      const results = await Promise.allSettled(
        batch.map(async (sourceMatchId) => ({
          sourceMatchId,
          html: await this.http.get(
            `${LEGA_VOLLEY_FEMMINILE_STATISTICS_URL}${sourceMatchId}`,
            LEGA_VOLLEY_HTTP_TIMEOUT_MS,
          ),
        })),
      );

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.warn(
            `Match statistics request failed for ${batch[index]}: ` +
              getErrorMessage(result.reason),
          );
          return;
        }

        const parsed = parseLegaVolleyFemminileMatchStatistics(
          result.value.html,
          result.value.sourceMatchId,
        );
        if (parsed) statistics.push(parsed);
      });
    }

    return statistics;
  }

  async fetchMatchRosters(
    matchExternalIds: string[],
  ): Promise<ILegaVolleyFemminileMatchRoster[]> {
    const sourceMatchIds = matchExternalIds.flatMap((externalId) => {
      const sourceMatchId = externalId.match(
        /^legavolley_femminile:(\d+)$/,
      )?.[1];
      return sourceMatchId ? [sourceMatchId] : [];
    });
    const rosters: ILegaVolleyFemminileMatchRoster[] = [];

    for (const batch of splitIntoBatches(
      sourceMatchIds,
      LEGA_VOLLEY_HTTP_CONCURRENCY,
    )) {
      const results = await Promise.allSettled(
        batch.map(async (sourceMatchId) => ({
          sourceMatchId,
          html: await this.http.get(
            `${LEGA_VOLLEY_FEMMINILE_BASE_URL}/match-center/${sourceMatchId}/roster/`,
            LEGA_VOLLEY_HTTP_TIMEOUT_MS,
          ),
        })),
      );

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.warn(
            `Match roster request failed for ${batch[index]}: ` +
              getErrorMessage(result.reason),
          );
          return;
        }

        const parsed = parseLegaVolleyFemminileMatchRoster(
          result.value.html,
          result.value.sourceMatchId,
        );
        if (parsed) rosters.push(parsed);
      });
    }

    return rosters;
  }
}
