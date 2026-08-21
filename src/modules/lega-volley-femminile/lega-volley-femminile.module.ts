import { Module } from '@nestjs/common';
import { ChampionshipsModule } from '../championships/championships.module';
import { LeaguesModule } from '../leagues/leagues.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { TeamsModule } from '../teams/teams.module';
import { MatchesModule } from '../matches/matches.module';
import { PlayersModule } from '../players/players.module';
import { LegaVolleyFemminileCatalogService } from './lega-volley-femminile-catalog.service';

@Module({
  imports: [
    SeasonsModule,
    ChampionshipsModule,
    LeaguesModule,
    TeamsModule,
    MatchesModule,
    PlayersModule,
  ],
  providers: [LegaVolleyFemminileCatalogService],
  exports: [LegaVolleyFemminileCatalogService],
})
export class LegaVolleyFemminileModule {}
