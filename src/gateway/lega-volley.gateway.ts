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
  IMapSettledParams,
  ILegaLeagueSchedule,
  ILegaPlayer,
} from '../interfaces/requests/lega-volley.interface';
import { IFetchedMatches } from '../interfaces/requests/matches.interface';
import {
  LEGA_VOLLEY_HTTP_CONCURRENCY,
  LEGA_VOLLEY_BASE_URL,
} from '../shared/consts/constants';
import {
  normalizeLegaSeasonName,
  parseLegaTeamPage,
  parseLegaSeason,
  readLegaMatches,
  readLegaOptions,
  readLegaTeams,
} from '../shared/lega-volley.utils';
import { HttpService } from '../shared/http/http.service';
import { getErrorMessage } from '../shared/error.utils';

@Injectable()
export class LegaVolleyGateway {
  private readonly logger = new Logger(LegaVolleyGateway.name);
  private readonly catalogs = new Map<number, ILegaCatalog>();

  constructor(private readonly http: HttpService) {}

  async fetchSeasonCatalogSince(
    earliestYear: number,
  ): Promise<IFetchedSeasonCatalog> {
    const currentYear = new Date().getFullYear();
    const firstHtml = await this.fetchSchedule(currentYear);
    const seasons = readLegaOptions(firstHtml, 'stagione')
      .map(({ value, label }) => ({ year: Number(value), name: label }))
      .filter(({ year }) => Number.isInteger(year) && year >= earliestYear);

    const results = await Promise.all(
      seasons.map(async ({ year, name }) => {
        const html =
          year === currentYear ? firstHtml : await this.fetchSchedule(year);
        return parseLegaSeason(year, normalizeLegaSeasonName(name), html);
      }),
    );

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
      isComplete: true,
    };
  }

  async fetchCompetitionStages(
    championships: ICevChampionship[],
  ): Promise<FetchedCompetitionStages> {
    const championshipIds = new Set(
      championships.map(({ externalId }) => externalId),
    );

    return {
      stages: [...this.catalogs.values()].flatMap(({ stages }) =>
        stages.filter(({ championshipExternalId }) =>
          championshipIds.has(championshipExternalId),
        ),
      ),
      isComplete: true,
    };
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
        const html = await this.http.get(
          `${LEGA_VOLLEY_BASE_URL}/team/${team.externalId}`,
        );
        return {
          ...team,
          ...parseLegaTeamPage(
            html,
            teamNames.get(team.externalId) ?? team.name,
            team.externalId,
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

  private fetchLeagueSchedule(
    year: number,
    leagueExternalId: number,
  ): Promise<string> {
    return this.http.get(
      `${LEGA_VOLLEY_BASE_URL}/schedule?stagione=${year}&campionato=${leagueExternalId}&fase=&AllMatches=true`,
    );
  }

  private fetchSchedule(year: number): Promise<string> {
    return this.http.get(
      `${LEGA_VOLLEY_BASE_URL}/schedule?stagione=${year}&campionato=-1&fase=&AllMatches=true`,
    );
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
