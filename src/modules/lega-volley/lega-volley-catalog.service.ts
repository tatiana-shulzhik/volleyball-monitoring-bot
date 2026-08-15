import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { SourcesEntity } from '../../databases/entities/sources.entity';
import { LegaVolleyGateway } from '../../gateway/lega-volley.gateway';
import { ESourceCode } from '../../shared/enums';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';

@Injectable()
export class LegaVolleyCatalogService {
  private readonly logger = new Logger(LegaVolleyCatalogService.name);

  constructor(
    private readonly gateway: LegaVolleyGateway,
    private readonly dataSource: DataSource,
  ) {}

  async synchronizeStoredRange(): Promise<void> {
    const earliestYear = new Date().getFullYear() - PREVIOUS_YEARS_COUNT;
    await this.synchronizeFrom(earliestYear);
  }

  async synchronizeCurrentAndFuture(): Promise<void> {
    await this.synchronizeFrom(new Date().getFullYear());
  }

  private async synchronizeFrom(earliestYear: number): Promise<void> {
    const catalog = await this.gateway.fetchSeasonCatalogSince(earliestYear);
    const source = await this.dataSource
      .getRepository(SourcesEntity)
      .findOneByOrFail({ code: ESourceCode.LegaVolley });
    const seasonsRepository = this.dataSource.getRepository(SeasonsEntity);
    const championshipsRepository =
      this.dataSource.getRepository(ChampionshipsEntity);
    const stagesRepository = this.dataSource.getRepository(
      CompetitionStagesEntity,
    );
    const leaguesRepository = this.dataSource.getRepository(LeaguesEntity);

    await seasonsRepository.upsert(
      [
        ...new Map(
          catalog.stages.flatMap(({ seasonName }) =>
            seasonName ? [[seasonName, { name: seasonName }] as const] : [],
          ),
        ).values(),
      ],
      { conflictPaths: ['name'], skipUpdateIfNoValuesChanged: true },
    );
    const seasons = await seasonsRepository.find();
    const seasonsByName = new Map(
      seasons.map((season) => [season.name, season]),
    );

    await championshipsRepository.upsert(
      catalog.championships.map((championship) => ({
        ...championship,
        source,
      })),
      { conflictPaths: ['externalId'], skipUpdateIfNoValuesChanged: true },
    );
    const championships = await championshipsRepository.find({
      where: { source: { id: source.id } },
    });
    const championshipsByExternalId = new Map(
      championships.map((championship) => [
        championship.externalId,
        championship,
      ]),
    );

    await stagesRepository.upsert(
      catalog.stages.map((stage) => ({
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
      {
        conflictPaths: ['externalId', 'championship'],
        skipUpdateIfNoValuesChanged: true,
      },
    );
    const stages = await stagesRepository.find({
      where: { championship: { source: { id: source.id } } },
      relations: { championship: true, season: true },
    });
    const stageByKey = new Map(
      stages.map((stage) => [
        `${stage.championship.externalId}:${stage.externalId}`,
        stage,
      ]),
    );

    await leaguesRepository.upsert(
      (await this.gateway.fetchLeagueCatalog(catalog.stages)).leagues.map(
        (league) => ({
          externalId: league.externalId,
          name: league.name,
          stage: stageByKey.get(
            `${league.championshipExternalId}:${league.stageExternalId}`,
          ),
        }),
      ),
      {
        conflictPaths: ['externalId', 'stage'],
        skipUpdateIfNoValuesChanged: true,
      },
    );

    this.logger.log(
      `LegaVolley catalog synchronized: ${catalog.championships.length} championships, ` +
        `${catalog.stages.length} stages`,
    );
  }
}
