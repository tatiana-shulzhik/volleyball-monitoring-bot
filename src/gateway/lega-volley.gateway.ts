import { Injectable } from '@nestjs/common';
import { ICevChampionship } from '../interfaces/requests/championships.interface';
import {
  FetchedCompetitionStages,
  ICevCompetitionStage,
} from '../interfaces/requests/competition-stages.interface';
import { FetchedLeagueCatalog } from '../interfaces/requests/leagues.interface';
import { IFetchedSeasonCatalog } from '../interfaces/requests/seasons.interface';
import { ILegaCatalog } from '../interfaces/requests/lega-volley.interface';
import { LEGA_VOLLEY_BASE_URL } from '../shared/consts/constants';
import {
  normalizeLegaSeasonName,
  parseLegaSeason,
  readLegaOptions,
} from '../shared/lega-volley.utils';
import { HttpService } from '../shared/http/http.service';

@Injectable()
export class LegaVolleyGateway {
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

    return {
      leagues: [...this.catalogs.values()].flatMap(({ leagues }) =>
        leagues.filter(({ championshipExternalId, stageExternalId }) =>
          keys.has(`${championshipExternalId}:${stageExternalId}`),
        ),
      ),
      teams: [],
      isComplete: true,
    };
  }

  private fetchSchedule(year: number): Promise<string> {
    return this.http.get(
      `${LEGA_VOLLEY_BASE_URL}/schedule?stagione=${year}&campionato=-1&fase=&AllMatches=true`,
    );
  }
}
