import { Injectable, Logger } from '@nestjs/common';
import {
  ILegaVolleyFemminileMatchRoster,
  ILegaVolleyFemminileMatchStatistics,
} from '../interfaces/requests/lega-volley-femminile.interface';
import { IFetchedMatches } from '../interfaces/requests/matches.interface';
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
  readLegaVolleyFemminileDateRange,
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
      catalog.competitions.map(({ externalId, seasonYear, serie }) =>
        this.fetchLeagueMatches(seasonYear, externalId, serie),
      ),
    );
    const fetched = scheduleResults.flatMap(({ fetched }) => fetched);
    const matches = this.mergeMatches(fetched);
    const datesByStageKey = new Map<string, Date[]>();
    for (const league of catalog.leagues) {
      const range = scheduleResults.find(
        (item) => item.leagueExternalId === league.externalId,
      )?.range;
      if (!range?.startsAt || !range.endsAt) continue;
      const stageKey = `${league.championshipExternalId}:${league.stageExternalId}`;
      const dates = datesByStageKey.get(stageKey) ?? [];
      dates.push(range.startsAt, range.endsAt);
      datesByStageKey.set(stageKey, dates);
    }
    for (const stage of catalog.stages) {
      const dates = datesByStageKey.get(
        `${stage.championshipExternalId}:${stage.externalId}`,
      );
      if (!dates?.length) continue;

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

  async fetchMatches(
    schedules: Array<{ year: number; leagueExternalId: number; serie: number }>,
  ): Promise<IFetchedMatches> {
    const uniqueSchedules = [
      ...new Map(
        schedules.map((schedule) => [
          `${schedule.year}:${schedule.serie}:${schedule.leagueExternalId}`,
          schedule,
        ]),
      ).values(),
    ];
    const fetched = [] as ReturnType<typeof readLegaVolleyFemminileMatches>[];
    let isComplete = true;

    for (const batch of splitIntoBatches(
      uniqueSchedules,
      LEGA_VOLLEY_HTTP_CONCURRENCY,
    )) {
      const results = await Promise.allSettled(
        batch.map(({ year, leagueExternalId, serie }) =>
          this.fetchLeagueMatches(year, leagueExternalId, serie),
        ),
      );
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          fetched.push(...result.value.fetched);
          return;
        }

        isComplete = false;
        const schedule = batch[index];
        this.logger.warn(
          `League matches request failed for ${schedule.leagueExternalId} ` +
            `(${schedule.year}): ${getErrorMessage(result.reason)}`,
        );
      });
    }

    return {
      matches: [...this.mergeMatches(fetched).values()],
      isComplete,
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

  private async fetchLeagueMatches(
    year: number,
    leagueExternalId: number,
    serie: number,
  ) {
    const query =
      `?campionato=${leagueExternalId}` +
      `&serie=${serie}&stagione=${year}&giornata=tutte`;
    const [resultsHtml, calendarHtml] = await Promise.all([
      this.http.get(
        `${LEGA_VOLLEY_FEMMINILE_BASE_URL}${LEGA_VOLLEY_FEMMINILE_RESULTS_PATH}${query}`,
      ),
      this.http.get(
        `${LEGA_VOLLEY_FEMMINILE_BASE_URL}${LEGA_VOLLEY_FEMMINILE_CATALOG_PATH}${query}`,
      ),
    ]);

    return {
      leagueExternalId,
      fetched: [resultsHtml, calendarHtml].map((html) =>
        readLegaVolleyFemminileMatches(html, leagueExternalId),
      ),
      range: readLegaVolleyFemminileDateRange(resultsHtml),
    };
  }

  private mergeMatches(
    fetched: Array<ReturnType<typeof readLegaVolleyFemminileMatches>>,
  ) {
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

    return matches;
  }
}
