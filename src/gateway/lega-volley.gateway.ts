import { Injectable, Logger } from '@nestjs/common';
import { ICevChampionship } from '../interfaces/requests/championships.interface';
import {
  FetchedCompetitionStages,
  ICevCompetitionStage,
} from '../interfaces/requests/competition-stages.interface';
import { FetchedLeagueCatalog } from '../interfaces/requests/leagues.interface';
import { ICevTeam } from '../interfaces/requests/teams.interface';
import { IFetchedSeasonCatalog } from '../interfaces/requests/seasons.interface';
import {
  ILegaCatalog,
  ILegaDateRange,
  IMapSettledParams,
  ILegaLeagueSchedule,
  ILegaPlayer,
  ILegaMatchReference,
  ILegaMatchStatistics,
  ILegaOption,
  ILegaPendingMatchKeys,
} from '../interfaces/requests/lega-volley.interface';
import { IFetchedMatches } from '../interfaces/requests/matches.interface';
import {
  LEGA_VOLLEY_HTTP_CONCURRENCY,
  LEGA_VOLLEY_HTTP_TIMEOUT_MS,
  LEGA_VOLLEY_BASE_URL,
} from '../shared/consts/constants';
import {
  normalizeLegaSeasonName,
  createLegaMatchLookupKey,
  parseLegaPostGaraDate,
  parseLegaTeamPage,
  parseLegaMatchStatistics,
  parseLegaSeason,
  readLegaMatches,
  readLegaMatchReferences,
  readLegaOptions,
  readLegaTeams,
  readLegaDateRange,
} from '../shared/lega-volley.utils';
import { HttpService } from '../shared/http/http.service';
import { getErrorMessage } from '../shared/error.utils';
import { parseSeasonEndYear } from '../shared/season.utils';

const LEGA_VOLLEY_POST_GARA_FALLBACK_BATCH_SIZE = 5;

interface ILegaPhaseDays {
  phase: string;
  days: ILegaOption[];
}

interface ILegaPhaseDay {
  phase: string;
  day: ILegaOption;
}

interface ILegaPendingMatchReference {
  id: string;
  playedOn: Date | null;
  teamNames: Pick<ILegaMatchReference, 'homeTeamName' | 'awayTeamName'>;
}

@Injectable()
export class LegaVolleyGateway {
  private readonly logger = new Logger(LegaVolleyGateway.name);
  private readonly catalogs = new Map<number, ILegaCatalog>();
  private readonly leagueScheduleRequests = new Map<string, Promise<string>>();
  private activeRequests = 0;
  private readonly requestWaiters: Array<() => void> = [];

  constructor(private readonly http: HttpService) {}

  async fetchSeasonCatalogSince(
    earliestYear: number,
  ): Promise<IFetchedSeasonCatalog> {
    const currentYear = new Date().getFullYear();
    const firstHtml = await this.fetchSchedule(currentYear);
    const seasons = readLegaOptions(firstHtml, 'stagione')
      .map(({ value, label }) => ({
        year: Number(value),
        name: normalizeLegaSeasonName(label),
      }))
      .filter(
        ({ year, name }) =>
          Number.isInteger(year) &&
          (parseSeasonEndYear(name) ?? 0) >= earliestYear,
      );

    const results = await Promise.all(
      seasons.map(async ({ year, name }) => {
        const html =
          year === currentYear ? firstHtml : await this.fetchSchedule(year);
        return parseLegaSeason(year, name, html);
      }),
    );
    const rangesComplete = await this.setStageDateRanges(results);

    const championships = new Map<number, ICevChampionship>();
    const stages = new Map<string, ICevCompetitionStage>();

    for (const result of results) {
      for (const championship of result.championships) {
        championships.set(championship.externalId, championship);
      }
      for (const stage of result.stages) {
        stages.set(
          `${stage.championshipExternalId}:${stage.externalId}`,
          stage,
        );
      }
      this.catalogs.set(result.year, result);
    }

    return {
      championships: [...championships.values()],
      stages: [...stages.values()],
      isComplete: rangesComplete,
    };
  }

  fetchCompetitionStages(
    championships: ICevChampionship[],
  ): Promise<FetchedCompetitionStages> {
    const championshipIds = new Set(
      championships.map(({ externalId }) => externalId),
    );

    return Promise.resolve({
      stages: [...this.catalogs.values()].flatMap(({ stages }) =>
        stages.filter(({ championshipExternalId }) =>
          championshipIds.has(championshipExternalId),
        ),
      ),
      isComplete: true,
    });
  }

  async fetchLeagueCatalog(
    stages: ICevCompetitionStage[],
  ): Promise<FetchedLeagueCatalog> {
    const keys = new Set(
      stages.map(
        ({ championshipExternalId, externalId }) =>
          `${championshipExternalId}:${externalId}`,
      ),
    );

    const catalogLeagues = [...this.catalogs.values()].flatMap((catalog) =>
      catalog.leagues
        .filter(({ championshipExternalId, stageExternalId }) =>
          keys.has(`${championshipExternalId}:${stageExternalId}`),
        )
        .map((league) => ({ league, year: catalog.year })),
    );
    const teamResults = await this.mapSettled({
      items: catalogLeagues,
      mapper: async ({ league, year }) => {
        const html = await this.fetchLeagueSchedule(year, league.externalId);
        return {
          teams: readLegaTeams(html, league.externalId),
          matches: readLegaMatches(html, league.externalId, year),
        };
      },
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });
    const teams: ICevTeam[] = teamResults.flatMap((result, index) => {
      if (result.status === 'fulfilled') return result.value.teams;

      const { league, year } = catalogLeagues[index];
      this.logger.warn(
        `League schedule request failed for ${league.externalId} ` +
          `(${year}): ${getErrorMessage(result.reason)}`,
      );
      return [];
    });
    const matches = teamResults.flatMap((result) =>
      result.status === 'fulfilled' ? result.value.matches : [],
    );
    const uniqueTeams = [
      ...new Map(
        teams.map((team) => [
          `${team.externalId}:${team.leagueExternalId}`,
          team,
        ]),
      ).values(),
    ];
    const teamNames = new Map(
      teams.map((team) => [team.externalId, team.name]),
    );
    const teamsToEnrich = [
      ...new Map(uniqueTeams.map((team) => [team.externalId, team])).values(),
    ];
    const enrichedResults = await this.mapSettled<
      ICevTeam,
      ICevTeam & { players: ILegaPlayer[] }
    >({
      items: teamsToEnrich,
      mapper: async (team) => {
        const html = await this.get(
          `${LEGA_VOLLEY_BASE_URL}/team/${team.externalId}`,
        );
        return {
          ...team,
          ...parseLegaTeamPage(
            html,
            teamNames.get(team.externalId) ?? team.name,
            team.externalId,
            team.country,
          ),
        };
      },
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });
    const enrichedTeams = enrichedResults.map((result, index) => {
      if (result.status === 'fulfilled') return result.value;

      this.logger.warn(
        `Team page request failed for ${teamsToEnrich[index].externalId}: ` +
          getErrorMessage(result.reason),
      );
      return { ...teamsToEnrich[index], players: [] };
    });
    const enrichedById = new Map(
      enrichedTeams.map((team) => [team.externalId, team]),
    );
    const players = uniqueTeams.flatMap((team) => {
      const enrichedTeam = enrichedById.get(team.externalId);
      return (enrichedTeam?.players ?? []).map((player) => ({
        ...player,
        leagueExternalId: team.leagueExternalId,
      }));
    });

    return {
      leagues: catalogLeagues.map(({ league }) => league),
      teams: uniqueTeams.map((team) => ({
        ...team,
        ...enrichedById.get(team.externalId),
      })),
      isComplete:
        teamResults.every((result) => result.status === 'fulfilled') &&
        enrichedResults.every((result) => result.status === 'fulfilled'),
      players,
      matches,
    };
  }

  async fetchMatches(
    schedules: ILegaLeagueSchedule[],
  ): Promise<IFetchedMatches> {
    const results = await this.mapSettled({
      items: schedules,
      mapper: async ({ year, leagueExternalId }) =>
        readLegaMatches(
          await this.fetchLeagueSchedule(year, leagueExternalId),
          leagueExternalId,
          year,
        ),
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const { year, leagueExternalId } = schedules[index];
        this.logger.warn(
          `League matches request failed for ${leagueExternalId} (${year}): ` +
            getErrorMessage(result.reason),
        );
      }
    });

    return {
      matches: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      ),
      isComplete: results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchPendingMatchStatistics(
    pendingMatchKeysByYearAndLeague: ReadonlyMap<
      number,
      ReadonlyMap<number, ILegaPendingMatchKeys>
    >,
  ): Promise<ILegaMatchStatistics[]> {
    const pendingSeasons = [...pendingMatchKeysByYearAndLeague.entries()];
    const results = await this.mapSettled({
      items: pendingSeasons,
      mapper: ([year, pendingMatchKeysByLeague]) =>
        this.fetchSeasonMatchStatistics(year, pendingMatchKeysByLeague),
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });

    return results.flatMap((result, index) => {
      if (result.status === 'fulfilled') return result.value;

      this.logger.warn(
        `Post-gara statistics request failed for ${pendingSeasons[index][0]}: ` +
          getErrorMessage(result.reason),
      );
      return [];
    });
  }

  async fetchMatchStatisticsByIds(
    matches: Array<{
      sourceMatchId: string;
      leagueExternalId: number;
      playedOn: Date | null;
      homeTeamName: string;
      awayTeamName: string;
    }>,
  ): Promise<ILegaMatchStatistics[]> {
    const results = await this.mapSettled({
      items: matches,
      mapper: async ({
        sourceMatchId,
        leagueExternalId,
        playedOn,
        homeTeamName,
        awayTeamName,
      }) => {
        const html = await this.get(
          `${LEGA_VOLLEY_BASE_URL}/match/${sourceMatchId}`,
        );
        const statistics = parseLegaMatchStatistics(
          html,
          sourceMatchId,
          leagueExternalId,
          playedOn,
          { homeTeamName, awayTeamName },
        );
        return statistics;
      },
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });

    return results.flatMap((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value ? [result.value] : [];
      }

      this.logger.warn(
        `Match statistics request failed for ${matches[index].sourceMatchId}: ` +
          getErrorMessage(result.reason),
      );
      return [];
    });
  }

  private async fetchSeasonMatchStatistics(
    year: number,
    pendingMatchKeysByLeague: ReadonlyMap<number, ILegaPendingMatchKeys>,
  ): Promise<ILegaMatchStatistics[]> {
    const html = await this.fetchPostGara({ year });
    const series = readLegaOptions(html, 'serie');
    const results = await this.mapSettled({
      items: series,
      mapper: (item) =>
        this.fetchSeriesMatchStatistics(year, item, pendingMatchKeysByLeague),
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });

    return results.flatMap((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Post-gara series request failed for ${year}/${series[index].value}: ` +
            getErrorMessage(result.reason),
        );
        return [];
      }

      return result.value;
    });
  }

  private async fetchSeriesMatchStatistics(
    year: number,
    series: ILegaOption,
    pendingMatchKeysByLeague: ReadonlyMap<number, ILegaPendingMatchKeys>,
  ): Promise<ILegaMatchStatistics[]> {
    const html = await this.fetchPostGara({ year, series: series.value });
    const championships = readLegaOptions(html, 'campionato').filter((item) =>
      pendingMatchKeysByLeague.has(Number(item.value)),
    );
    const results = await this.mapSettled({
      items: championships,
      mapper: (item) => {
        const pendingMatchKeys = pendingMatchKeysByLeague.get(
          Number(item.value),
        );
        if (!pendingMatchKeys) return Promise.resolve([]);

        return this.fetchChampionshipMatchStatistics(
          year,
          series.value,
          item,
          pendingMatchKeys,
        );
      },
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });

    return results.flatMap((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Post-gara championship request failed for ${year}/${championships[index].value}: ` +
            getErrorMessage(result.reason),
        );
        return [];
      }

      return result.value;
    });
  }

  private async fetchChampionshipMatchStatistics(
    year: number,
    series: string,
    championship: ILegaOption,
    pendingMatchKeys: ILegaPendingMatchKeys,
  ): Promise<ILegaMatchStatistics[]> {
    const html = await this.fetchPostGara({
      year,
      series,
      championship: championship.value,
    });
    const phases = readLegaOptions(html, 'fase');
    const matches = await this.findPendingChampionshipMatches(
      year,
      series,
      championship.value,
      phases,
      pendingMatchKeys,
    );
    const results = await this.mapSettled({
      items: matches,
      mapper: async ({ id, playedOn, teamNames }) =>
        parseLegaMatchStatistics(
          await this.get(`${LEGA_VOLLEY_BASE_URL}/match/${id}`),
          id,
          Number(championship.value),
          playedOn,
          teamNames,
        ),
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });

    return results.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : [],
    );
  }

  private async findPendingChampionshipMatches(
    year: number,
    series: string,
    championship: string,
    phases: ILegaOption[],
    pendingMatchKeys: ILegaPendingMatchKeys,
  ): Promise<ILegaPendingMatchReference[]> {
    const phaseResults = await this.mapSettled({
      items: phases,
      mapper: async (phase): Promise<ILegaPhaseDays> => ({
        phase: phase.value,
        days: readLegaOptions(
          await this.fetchPostGara({
            year,
            series,
            championship,
            phase: phase.value,
          }),
          'giornata',
        ),
      }),
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });
    const phaseDays = phaseResults.flatMap((result, index) => {
      if (result.status === 'fulfilled') return [result.value];

      this.logger.warn(
        `Post-gara phase request failed for ${championship}/${phases[index].value}: ` +
          getErrorMessage(result.reason),
      );
      return [];
    });
    const primaryDays = phaseDays.flatMap(({ phase, days }) =>
      days
        .filter((day) => {
          const date = parseLegaPostGaraDate(day.label)
            ?.toISOString()
            .slice(0, 10);
          return date !== undefined && pendingMatchKeys.dates.has(date);
        })
        .map((day) => ({ phase, day })),
    );
    const primaryDayValues = new Set(primaryDays.map(({ day }) => day));
    const fallbackDays = phaseDays.flatMap(({ phase, days }) =>
      days
        .filter((day) => !primaryDayValues.has(day))
        .map((day) => ({ phase, day })),
    );
    const unresolvedExactMatchKeys = new Set(pendingMatchKeys.exactMatchKeys);
    const unresolvedDateUnknownTeamKeys = new Set(
      pendingMatchKeys.dateUnknownTeamKeys,
    );
    const matches: ILegaPendingMatchReference[] = [];

    const collectMatches = async (days: ILegaPhaseDay[]) => {
      const results = await this.fetchChampionshipDayHtml(
        year,
        series,
        championship,
        days,
      );
      for (const { day, html } of results) {
        const playedOn = parseLegaPostGaraDate(day.label);
        for (const reference of readLegaMatchReferences(html)) {
          const matchKey = createLegaMatchLookupKey(
            Number(championship),
            reference.homeTeamName,
            reference.awayTeamName,
            playedOn,
          );
          const teamsKey = createLegaMatchLookupKey(
            Number(championship),
            reference.homeTeamName,
            reference.awayTeamName,
            null,
          );
          const isExactMatch = pendingMatchKeys.exactMatchKeys.has(matchKey);
          const fallbackExactMatchKeys =
            pendingMatchKeys.exactMatchKeysByTeam.get(teamsKey);
          if (
            !isExactMatch &&
            fallbackExactMatchKeys === undefined &&
            !pendingMatchKeys.dateUnknownTeamKeys.has(teamsKey)
          ) {
            continue;
          }

          if (isExactMatch) {
            unresolvedExactMatchKeys.delete(matchKey);
          } else if (fallbackExactMatchKeys?.size === 1) {
            unresolvedExactMatchKeys.delete(
              fallbackExactMatchKeys.values().next().value!,
            );
          }
          unresolvedDateUnknownTeamKeys.delete(teamsKey);
          matches.push({
            id: reference.sourceMatchId,
            playedOn,
            teamNames: reference,
          });
        }
      }
    };

    await collectMatches(primaryDays);
    for (
      let index = 0;
      (unresolvedExactMatchKeys.size || unresolvedDateUnknownTeamKeys.size) &&
      index < fallbackDays.length;
      index += LEGA_VOLLEY_POST_GARA_FALLBACK_BATCH_SIZE
    ) {
      await collectMatches(
        fallbackDays.slice(
          index,
          index + LEGA_VOLLEY_POST_GARA_FALLBACK_BATCH_SIZE,
        ),
      );
    }

    return [...new Map(matches.map((match) => [match.id, match])).values()];
  }

  private async fetchChampionshipDayHtml(
    year: number,
    series: string,
    championship: string,
    days: ILegaPhaseDay[],
  ): Promise<Array<ILegaPhaseDay & { html: string }>> {
    const results = await this.mapSettled({
      items: days,
      mapper: async (item) => ({
        ...item,
        html: await this.fetchPostGara({
          year,
          series,
          championship,
          phase: item.phase,
          day: item.day.value,
        }),
      }),
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });

    return results.flatMap((result, index) => {
      if (result.status === 'fulfilled') return [result.value];

      this.logger.warn(
        `Post-gara match day request failed for ${championship}/${days[index].phase}/${days[index].day.value}: ` +
          getErrorMessage(result.reason),
      );
      return [];
    });
  }

  private async fetchPhaseMatchStatistics(
    year: number,
    series: string,
    championship: string,
    phase: ILegaOption,
    pendingMatchKeys: ILegaPendingMatchKeys,
  ): Promise<ILegaMatchStatistics[]> {
    const html = await this.fetchPostGara({
      year,
      series,
      championship,
      phase: phase.value,
    });
    const days = readLegaOptions(html, 'giornata');
    const primaryDays = days.filter((day) => {
      const date = parseLegaPostGaraDate(day.label)?.toISOString().slice(0, 10);
      return date !== undefined && pendingMatchKeys.dates.has(date);
    });
    const fallbackDays = days.filter((day) => !primaryDays.includes(day));
    const unresolvedExactMatchKeys = new Set(pendingMatchKeys.exactMatchKeys);
    const unresolvedDateUnknownTeamKeys = new Set(
      pendingMatchKeys.dateUnknownTeamKeys,
    );
    const matches: Array<{
      id: string;
      playedOn: Date | null;
      teamNames?: Pick<ILegaMatchReference, 'homeTeamName' | 'awayTeamName'>;
    }> = [];

    const collectMatches = async (daysToFetch: ILegaOption[]) => {
      const dayResults = await this.fetchPhaseDayHtml(
        year,
        series,
        championship,
        phase.value,
        daysToFetch,
      );

      for (const { day, html } of dayResults) {
        const playedOn = parseLegaPostGaraDate(day.label);

        for (const {
          sourceMatchId,
          homeTeamName,
          awayTeamName,
        } of readLegaMatchReferences(html)) {
          const matchKey = createLegaMatchLookupKey(
            Number(championship),
            homeTeamName,
            awayTeamName,
            playedOn,
          );
          const teamsKey = createLegaMatchLookupKey(
            Number(championship),
            homeTeamName,
            awayTeamName,
            null,
          );
          const isExactMatch = pendingMatchKeys.exactMatchKeys.has(matchKey);
          const fallbackExactMatchKeys =
            pendingMatchKeys.exactMatchKeysByTeam.get(teamsKey);
          const isPending =
            isExactMatch ||
            fallbackExactMatchKeys !== undefined ||
            pendingMatchKeys.dateUnknownTeamKeys.has(teamsKey);

          if (!isPending) {
            this.logger.debug(
              `[POSTGARA SKIPPED] externalId=${sourceMatchId} ` +
                `league=${championship} home="${homeTeamName}" ` +
                `away="${awayTeamName}" ` +
                `date=${playedOn?.toISOString() ?? 'null'}`,
            );
            continue;
          }

          if (isExactMatch) {
            unresolvedExactMatchKeys.delete(matchKey);
          } else if (fallbackExactMatchKeys?.size === 1) {
            unresolvedExactMatchKeys.delete(
              fallbackExactMatchKeys.values().next().value!,
            );
          }
          unresolvedDateUnknownTeamKeys.delete(teamsKey);
          matches.push({
            id: sourceMatchId,
            playedOn,
            teamNames: { homeTeamName, awayTeamName },
          });
        }
      }
    };

    await collectMatches(primaryDays);

    for (
      let index = 0;
      (unresolvedExactMatchKeys.size || unresolvedDateUnknownTeamKeys.size) &&
      index < fallbackDays.length;
      index += LEGA_VOLLEY_POST_GARA_FALLBACK_BATCH_SIZE
    ) {
      await collectMatches(
        fallbackDays.slice(
          index,
          index + LEGA_VOLLEY_POST_GARA_FALLBACK_BATCH_SIZE,
        ),
      );
    }

    const uniqueMatches = [
      ...new Map(matches.map((match) => [match.id, match])).values(),
    ];
    const matchResults = await this.mapSettled({
      items: uniqueMatches,
      mapper: async ({ id, playedOn, teamNames }) => {
        const statistics = parseLegaMatchStatistics(
          await this.get(`${LEGA_VOLLEY_BASE_URL}/match/${id}`),
          id,
          Number(championship),
          playedOn,
          teamNames,
        );
        return statistics;
      },
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });

    return matchResults.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : [],
    );
  }

  private async fetchPhaseDayHtml(
    year: number,
    series: string,
    championship: string,
    phase: string,
    days: ILegaOption[],
  ): Promise<Array<{ day: ILegaOption; html: string }>> {
    const dayResults = await this.mapSettled({
      items: days,
      mapper: async (day) => ({
        day,
        html: await this.fetchPostGara({
          year,
          series,
          championship,
          phase,
          day: day.value,
        }),
      }),
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });

    return dayResults.flatMap((result, index) => {
      if (result.status === 'fulfilled') return [result.value];

      this.logger.warn(
        `Post-gara match day request failed for ${championship}/${days[index].value}: ` +
          getErrorMessage(result.reason),
      );
      return [];
    });
  }

  private fetchPostGara(params: {
    year: number;
    series?: string;
    championship?: string;
    phase?: string;
    day?: string;
  }): Promise<string> {
    const query = new URLSearchParams({ stagione: String(params.year) });
    if (params.series) query.set('serie', params.series);
    if (params.championship) query.set('campionato', params.championship);
    if (params.phase) query.set('fase', params.phase);
    if (params.day) query.set('giornata', params.day);

    return this.get(`${LEGA_VOLLEY_BASE_URL}/postgara/?${query}`);
  }

  private fetchLeagueSchedule(
    year: number,
    leagueExternalId: number,
  ): Promise<string> {
    const key = `${year}:${leagueExternalId}`;
    const existing = this.leagueScheduleRequests.get(key);
    if (existing) return existing;

    const request = this.get(
      `${LEGA_VOLLEY_BASE_URL}/schedule?stagione=${year}&campionato=${leagueExternalId}&fase=&AllMatches=true`,
    );
    this.leagueScheduleRequests.set(key, request);
    void request.catch(() => this.leagueScheduleRequests.delete(key));

    return request;
  }

  private async setStageDateRanges(catalogs: ILegaCatalog[]): Promise<boolean> {
    const leagueSources = catalogs.flatMap(({ year, leagues }) =>
      leagues.map((league) => ({ year, league })),
    );
    const results = await this.mapSettled({
      items: leagueSources,
      mapper: async ({ year, league }) =>
        readLegaDateRange(
          await this.fetchLeagueSchedule(year, league.externalId),
        ),
      concurrency: LEGA_VOLLEY_HTTP_CONCURRENCY,
    });
    const rangesByStageKey = new Map<string, ILegaDateRange>();

    results.forEach((result, index) => {
      const { year, league } = leagueSources[index];
      if (result.status === 'rejected') {
        this.logger.warn(
          `League schedule request failed for ${league.externalId} ` +
            `(${year}): ${getErrorMessage(result.reason)}`,
        );
        return;
      }

      const key = `${league.championshipExternalId}:${league.stageExternalId}`;
      const range = rangesByStageKey.get(key) ?? {};
      const { startsAt, endsAt } = result.value;
      rangesByStageKey.set(key, {
        startsAt:
          !range.startsAt || (startsAt && startsAt < range.startsAt)
            ? startsAt
            : range.startsAt,
        endsAt:
          !range.endsAt || (endsAt && endsAt > range.endsAt)
            ? endsAt
            : range.endsAt,
      });
    });

    for (const catalog of catalogs) {
      catalog.stages = catalog.stages.map((stage) => ({
        ...stage,
        ...rangesByStageKey.get(
          `${stage.championshipExternalId}:${stage.externalId}`,
        ),
      }));
    }

    return results.every((result) => result.status === 'fulfilled');
  }

  private fetchSchedule(year: number): Promise<string> {
    return this.get(
      `${LEGA_VOLLEY_BASE_URL}/schedule?stagione=${year}&campionato=-1&fase=&AllMatches=true`,
    );
  }

  private async get(url: string): Promise<string> {
    await this.acquireRequestSlot();
    try {
      return await this.http.get(url, LEGA_VOLLEY_HTTP_TIMEOUT_MS);
    } finally {
      this.releaseRequestSlot();
    }
  }

  private async acquireRequestSlot(): Promise<void> {
    if (this.activeRequests < LEGA_VOLLEY_HTTP_CONCURRENCY) {
      this.activeRequests++;
      return;
    }

    await new Promise<void>((resolve) => this.requestWaiters.push(resolve));
  }

  private releaseRequestSlot(): void {
    const next = this.requestWaiters.shift();
    if (next) {
      next();
      return;
    }

    this.activeRequests--;
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
