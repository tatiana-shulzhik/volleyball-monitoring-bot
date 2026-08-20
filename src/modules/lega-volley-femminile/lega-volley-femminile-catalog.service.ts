import { Injectable, Logger } from '@nestjs/common';
import { LegaVolleyFemminileGateway } from '../../gateway/lega-volley-femminile.gateway';
import { ESourceCode } from '../../shared/enums';
import { getEarliestCatalogYear } from '../../shared/season.utils';
import { ChampionshipsService } from '../championships/championships.service';
import { LeaguesService } from '../leagues/leagues.service';
import { SeasonsService } from '../seasons/seasons.service';

@Injectable()
export class LegaVolleyFemminileCatalogService {
  private readonly logger = new Logger(LegaVolleyFemminileCatalogService.name);

  constructor(
    private readonly gateway: LegaVolleyFemminileGateway,
    private readonly seasonsService: SeasonsService,
    private readonly championshipsService: ChampionshipsService,
    private readonly leaguesService: LeaguesService,
  ) {}

  synchronizeStoredRange(): Promise<void> {
    return this.synchronizeFrom(getEarliestCatalogYear());
  }

  synchronizeCurrentAndFuture(): Promise<void> {
    return this.synchronizeFrom(new Date().getFullYear());
  }

  private async synchronizeFrom(earliestYear: number): Promise<void> {
    const catalog = await this.gateway.fetchCatalogSince(earliestYear);
    const seasonsByName = await this.seasonsService.upsertCatalogSeasons(
      catalog.stages,
    );
    const championshipsByExternalId =
      await this.championshipsService.upsertCatalogChampionships(
        catalog.championships,
        ESourceCode.LegaVolleyFemminile,
      );
    const stagesByKey = await this.championshipsService.upsertCatalogStages(
      catalog.stages,
      seasonsByName,
      championshipsByExternalId,
      ESourceCode.LegaVolleyFemminile,
    );
    await this.leaguesService.upsertCatalogLeagues(
      catalog.leagues,
      stagesByKey,
      ESourceCode.LegaVolleyFemminile,
    );

    this.logger.log(
      `LegaVolleyFemminile catalog synchronized: ${catalog.championships.length} championships, ` +
        `${catalog.stages.length} stages, ${catalog.leagues.length} leagues`,
    );
  }
}
