import { Injectable, Logger } from '@nestjs/common';
import { In, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import {
  FetchedCompetitionStages,
  ICevCompetitionStage,
} from '../../interfaces/requests/competition-stages.interface';
import { ICevChampionship } from '../../interfaces/requests/championships.interface';
import { SynchronizedSeasonCatalog } from '../../interfaces/responses/synchronized-season-catalog.interface';
import {
  calculateStageChanges,
  createCompetitionStageKey,
} from '../../shared/competition-stages.utils';
import { applyEntityChanges } from '../../shared/synchronization.utils';
import { ESourceCode } from '../../shared/enums';
import { inferSeasonName } from '../../shared/season.utils';

@Injectable()
export class ChampionshipsService {
  private readonly logger = new Logger(ChampionshipsService.name);

  constructor(
    private readonly repository: CompetitionStagesRepository,
    private readonly championshipsRepository: ChampionshipsRepository,
  ) {}

  async upsertCatalogChampionships(
    championships: ICevChampionship[],
    sourceCode: ESourceCode,
  ): Promise<Map<number, ChampionshipsEntity>> {
    await this.championshipsRepository.updateMany(
      championships,
      undefined,
      sourceCode,
    );

    return new Map(
      (
        await this.championshipsRepository.getWhere({
          source: { code: sourceCode },
        })
      ).map((championship) => [championship.externalId, championship]),
    );
  }

  async upsertCatalogStages(
    stages: ICevCompetitionStage[],
    seasonsByName: Map<string, SeasonsEntity>,
    championshipsByExternalId: Map<number, ChampionshipsEntity>,
    sourceCode: ESourceCode,
  ): Promise<Map<string, CompetitionStagesEntity>> {
    await this.repository.updateMany(
      stages.map((stage) => ({
        externalId: stage.externalId,
        name: stage.name,
        startsAt: stage.startsAt ?? null,
        endsAt: stage.endsAt ?? null,
        season: stage.seasonName
          ? (seasonsByName.get(stage.seasonName) ?? null)
          : null,
        championship: championshipsByExternalId.get(
          stage.championshipExternalId,
        ),
      })),
    );

    return new Map(
      (
        await this.repository.getWhere({
          championship: { source: { code: sourceCode } },
        })
      ).map((stage) => [
        `${stage.championship.externalId}:${stage.externalId}`,
        stage,
      ]),
    );
  }

  async synchronize(
    catalog: SynchronizedSeasonCatalog,
    fetched: FetchedCompetitionStages,
  ): Promise<CompetitionStagesEntity[]> {
    const { championships, calendarStages, seasons } = catalog;

    if (!championships.length) {
      this.logger.warn('No championships found; stage sync skipped');
      return [];
    }

    const incoming = this.mergeStages(
      calendarStages,
      fetched.stages,
      fetched.isComplete,
      new Map(
        championships.map((championship) => [
          championship.externalId,
          championship,
        ]),
      ),
    );
    const existing = await this.repository.getWhere({
      championship: { id: In(championships.map(({ id }) => id)) },
    });
    const changes = calculateStageChanges({
      incoming,
      existing,
      championshipsByExternalId: new Map(
        championships.map((championship) => [
          championship.externalId,
          championship,
        ]),
      ),
      seasonsByName: new Map(seasons.map((season) => [season.name, season])),
    });

    await applyEntityChanges({
      repository: this.repository,
      changes,
      allowDeletion: fetched.isComplete,
    });
    return this.repository.getWhere({
      championship: { id: In(championships.map(({ id }) => id)) },
    });
  }

  getCevStages(): Promise<CompetitionStagesEntity[]> {
    return this.repository.getWhere({
      championship: { source: { code: ESourceCode.Cev } },
    });
  }

  getCurrentCevStages(now: Date): Promise<CompetitionStagesEntity[]> {
    return this.repository.getWhere({
      startsAt: LessThanOrEqual(now),
      endsAt: MoreThanOrEqual(now),
      championship: { source: { code: ESourceCode.Cev } },
    });
  }

  getStartedCevStages(now: Date): Promise<CompetitionStagesEntity[]> {
    return this.repository.getWhere({
      startsAt: LessThanOrEqual(now),
      championship: { source: { code: ESourceCode.Cev } },
    });
  }

  getCevStagesByIds(ids: number[]): Promise<CompetitionStagesEntity[]> {
    return this.repository.getWhere({
      id: In(ids),
      championship: { source: { code: ESourceCode.Cev } },
    });
  }

  private mergeStages(
    calendarStages: ICevCompetitionStage[],
    detailedStages: ICevCompetitionStage[],
    isComplete: boolean,
    championshipsByExternalId: Map<number, ChampionshipsEntity>,
  ): ICevCompetitionStage[] {
    const calendarByKey = new Map(
      calendarStages.map((stage) => [
        createCompetitionStageKey(
          stage.championshipExternalId,
          stage.externalId,
        ),
        stage,
      ]),
    );
    const enrichedDetailedStages = detailedStages.map((stage) => {
      const calendarStage = calendarByKey.get(
        createCompetitionStageKey(
          stage.championshipExternalId,
          stage.externalId,
        ),
      );
      const championship = championshipsByExternalId.get(
        stage.championshipExternalId,
      );

      return {
        ...stage,
        startsAt: stage.startsAt ?? calendarStage?.startsAt,
        endsAt: stage.endsAt ?? calendarStage?.endsAt,
        seasonName:
          stage.seasonName ??
          calendarStage?.seasonName ??
          inferSeasonName(championship?.name, championship?.competitionType),
      };
    });

    if (isComplete) {
      return enrichedDetailedStages;
    }

    return [
      ...new Map(
        [...calendarStages, ...enrichedDetailedStages].map((stage) => [
          createCompetitionStageKey(
            stage.championshipExternalId,
            stage.externalId,
          ),
          stage,
        ]),
      ).values(),
    ];
  }
}
