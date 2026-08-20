import { Module } from '@nestjs/common';
import { ChampionshipsModule } from '../championships/championships.module';
import { LeaguesModule } from '../leagues/leagues.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { LegaVolleyFemminileCatalogService } from './lega-volley-femminile-catalog.service';

@Module({
  imports: [SeasonsModule, ChampionshipsModule, LeaguesModule],
  providers: [LegaVolleyFemminileCatalogService],
  exports: [LegaVolleyFemminileCatalogService],
})
export class LegaVolleyFemminileModule {}
