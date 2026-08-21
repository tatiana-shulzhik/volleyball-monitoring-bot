import { Injectable, Logger } from '@nestjs/common';
import {
  ILegaVolleyFemminileMatchStatistics,
  ILegaVolleyFemminileTeamRoster,
} from '../interfaces/requests/lega-volley-femminile.interface';
import { IFetchedMatches } from '../interfaces/requests/matches.interface';
import {
  LEGA_VOLLEY_FEMMINILE_BASE_URL,
  LEGA_VOLLEY_FEMMINILE_CATALOG_PATH,
  LEGA_VOLLEY_FEMMINILE_RESULTS_PATH,
  LEGA_VOLLEY_FEMMINILE_SEASONS_PATH,
  LEGA_VOLLEY_FEMMINILE_STATISTICS_URL,
  LEGA_VOLLEY_FEMMINILE_SUMMER_TOUR_2023_PRESENTATION_URL,
  LEGA_VOLLEY_FEMMINILE_SUMMER_TOUR_2023_URLS,
  LEGA_VOLLEY_HTTP_CONCURRENCY,
  LEGA_VOLLEY_HTTP_TIMEOUT_MS,
} from '../shared/consts/constants';
import { HttpService } from '../shared/http/http.service';
import { splitIntoBatches } from '../shared/array.utils';
import { getErrorMessage } from '../shared/error.utils';
import { EMatchStatus } from '../shared/enums';
import {
  createSummerTourPlayerNamesBySurname,
  parseLegaVolleyFemminileCatalog,
  parseLegaVolleyFemminileMatchStatistics,
  parseLegaVolleyFemminileTeamRoster,
  parseLegaVolleyFemminileSummerTourRosters,
  readLegaVolleyFemminileCalendarTeams,
  readLegaVolleyFemminileDateRange,
  readLegaVolleyFemminileMatches,
  readLegaVolleyFemminileSelectedCompetitionId,
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
      catalog.competitions.map(({ externalId, seasonYear, serie, name }) =>
        this.fetchLeagueMatches(
          seasonYear,
          externalId,
          serie,
          /\bA2\b/i.test(name),
        ),
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
      teams: scheduleResults.flatMap(({ fetched, serie }) =>
        fetched.flatMap((result) =>
          result.teams.map((team) => ({ ...team, serie })),
        ),
      ),
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
    const sourceMatches = matchExternalIds.flatMap((externalId) => {
      const sourceMatchId = externalId.match(
        /^(?:legavolley_femminile:)?(\d+)$/,
      )?.[1];
      return sourceMatchId ? [{ externalId, sourceMatchId }] : [];
    });
    const statistics: ILegaVolleyFemminileMatchStatistics[] = [];

    for (const batch of splitIntoBatches(
      sourceMatches,
      LEGA_VOLLEY_HTTP_CONCURRENCY,
    )) {
      const results = await Promise.allSettled(
        batch.map(async (sourceMatch) => ({
          ...sourceMatch,
          html: await this.http.get(
            `${LEGA_VOLLEY_FEMMINILE_STATISTICS_URL}${sourceMatch.sourceMatchId}`,
            LEGA_VOLLEY_HTTP_TIMEOUT_MS,
          ),
        })),
      );

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.warn(
            `Match statistics request failed for ${batch[index].externalId}: ` +
              getErrorMessage(result.reason),
          );
          return;
        }

        const parsed = parseLegaVolleyFemminileMatchStatistics(
          result.value.html,
          result.value.sourceMatchId,
        );
        if (parsed) {
          statistics.push({
            ...parsed,
            matchExternalId: result.value.externalId,
          });
        }
      });
    }

    return statistics;
  }

  async fetchTeamRosters(
    sources: Array<{
      teamExternalId: string;
      teamName: string;
      leagueExternalId: number;
      leagueName: string;
      year: number;
    }>,
  ): Promise<{
    rosters: ILegaVolleyFemminileTeamRoster[];
    isComplete: boolean;
  }> {
    const rosters: ILegaVolleyFemminileTeamRoster[] = [];
    const summerTourSources = sources.filter((source) =>
      this.getSummerTourRosterUrl(source.year, source.leagueName),
    );
    const standardSources = sources.filter(
      (source) => !summerTourSources.includes(source),
    );
    const summerTour = await this.fetchSummerTourRosters(summerTourSources);
    rosters.push(...summerTour.rosters);
    let isComplete = summerTour.isComplete;
    const standardSourcesByKey = new Map(
      standardSources.map((source) => [
        `${source.year}:${source.teamExternalId}`,
        source,
      ]),
    );

    for (const batch of splitIntoBatches(
      [...standardSourcesByKey.values()],
      LEGA_VOLLEY_HTTP_CONCURRENCY,
    )) {
      const results = await Promise.allSettled(
        batch.map(async (source) => ({
          source,
          html: await this.http.get(
            `${LEGA_VOLLEY_FEMMINILE_BASE_URL}/club/x/${source.teamExternalId}/roster/` +
              `?stagione=${source.year}&view=elenco`,
          ),
        })),
      );

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          isComplete = false;
          const source = batch[index];
          this.logger.warn(
            `Team roster request failed for ${source.teamExternalId} ` +
              `(${source.year}): ${getErrorMessage(result.reason)}`,
          );
          return;
        }

        const players = parseLegaVolleyFemminileTeamRoster(result.value.html);
        if (!players.length) {
          isComplete = false;
          return;
        }

        const rosterSources = standardSources.filter(
          (source) =>
            source.year === result.value.source.year &&
            source.teamExternalId === result.value.source.teamExternalId,
        );
        rosters.push(
          ...rosterSources.map((source) => ({
            teamExternalId: source.teamExternalId,
            leagueExternalId: source.leagueExternalId,
            players,
          })),
        );
      });
    }

    return { rosters, isComplete };
  }

  private async fetchSummerTourRosters(
    sources: Array<{
      teamExternalId: string;
      teamName: string;
      leagueExternalId: number;
      leagueName: string;
      year: number;
    }>,
  ): Promise<{
    rosters: ILegaVolleyFemminileTeamRoster[];
    isComplete: boolean;
  }> {
    if (!sources.length) return { rosters: [], isComplete: true };

    let isComplete = true;
    let namesBySurname = new Map<string, string>();
    try {
      const presentationHtml = await this.http.get(
        LEGA_VOLLEY_FEMMINILE_SUMMER_TOUR_2023_PRESENTATION_URL,
      );
      namesBySurname = createSummerTourPlayerNamesBySurname(
        parseLegaVolleyFemminileSummerTourRosters(presentationHtml),
      );
    } catch (error) {
      isComplete = false;
      this.logger.warn(
        `Summer Tour presentation request failed: ${getErrorMessage(error)}`,
      );
    }

    const urls = [
      ...new Set(
        sources.flatMap((source) => {
          const url = this.getSummerTourRosterUrl(
            source.year,
            source.leagueName,
          );
          return url ? [url] : [];
        }),
      ),
    ];
    const results = await Promise.allSettled(
      urls.map(async (url) => ({ url, html: await this.http.get(url) })),
    );
    const rosters: ILegaVolleyFemminileTeamRoster[] = [];

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        isComplete = false;
        this.logger.warn(
          `Summer Tour roster request failed for ${urls[index]}: ` +
            getErrorMessage(result.reason),
        );
        return;
      }

      const parsed = parseLegaVolleyFemminileSummerTourRosters(
        result.value.html,
        namesBySurname,
      );
      for (const source of sources.filter(
        (item) =>
          this.getSummerTourRosterUrl(item.year, item.leagueName) ===
          result.value.url,
      )) {
        const roster = parsed.find(({ teamName }) =>
          this.isSameSummerTourTeam(teamName, source.teamName),
        );
        if (!roster) {
          isComplete = false;
          this.logger.warn(
            `Summer Tour roster not found for ${source.teamExternalId} ` +
              `(${source.year})`,
          );
          continue;
        }

        rosters.push({
          teamExternalId: source.teamExternalId,
          leagueExternalId: source.leagueExternalId,
          players: roster.players,
        });
      }
    });

    return { rosters, isComplete };
  }

  private async fetchLeagueMatches(
    year: number,
    leagueExternalId: number,
    serie: number,
    isA2 = false,
  ) {
    const calendarQuery =
      `?campionato=${leagueExternalId}` +
      `&serie=${serie}&stagione=${year}&giornata=tutte`;
    const resultsQuery =
      `?campionato=${leagueExternalId}` +
      `&serie=${isA2 ? 2 : serie}&stagione=${year}&giornata=tutte`;
    const [resultsHtml, calendarHtml] = await Promise.all([
      this.http.get(
        `${LEGA_VOLLEY_FEMMINILE_BASE_URL}${LEGA_VOLLEY_FEMMINILE_RESULTS_PATH}${resultsQuery}`,
      ),
      this.http.get(
        `${LEGA_VOLLEY_FEMMINILE_BASE_URL}${LEGA_VOLLEY_FEMMINILE_CATALOG_PATH}${calendarQuery}`,
      ),
    ]);
    const results = readLegaVolleyFemminileMatches(
      resultsHtml,
      leagueExternalId,
    );
    const matches =
      readLegaVolleyFemminileSelectedCompetitionId(resultsHtml) ===
      leagueExternalId
        ? results.matches
        : [];
    const teams = readLegaVolleyFemminileCalendarTeams(
      calendarHtml,
      leagueExternalId,
    );

    return {
      leagueExternalId,
      serie,
      fetched: [{ teams: teams.length ? teams : results.teams, matches }],
      range: readLegaVolleyFemminileDateRange(calendarHtml),
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
        if (!existing || match.status === EMatchStatus.Finished) {
          matches.set(match.externalId, match);
        }
      }
    }

    return matches;
  }

  private getSummerTourRosterUrl(
    year: number,
    leagueName: string,
  ): string | undefined {
    if (year !== 2022) return undefined;
    if (leagueName.startsWith('17') && /Supercoppa Italiana/.test(leagueName)) {
      return LEGA_VOLLEY_FEMMINILE_SUMMER_TOUR_2023_URLS.supercoppa;
    }
    if (leagueName.startsWith('23') && /Coppa Italia/.test(leagueName)) {
      return LEGA_VOLLEY_FEMMINILE_SUMMER_TOUR_2023_URLS.coppaItalia;
    }
    if (leagueName.startsWith('28') && /Campionato Italiano/.test(leagueName)) {
      return LEGA_VOLLEY_FEMMINILE_SUMMER_TOUR_2023_URLS.campionatoItaliano;
    }

    return undefined;
  }

  private isSameSummerTourTeam(left: string, right: string): boolean {
    return (
      this.normalizeSummerTourTeam(left) === this.normalizeSummerTourTeam(right)
    );
  }

  private normalizeSummerTourTeam(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/millenium/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }
}
