import { Module } from '@nestjs/common';
import { ChampionshipsModule } from '../championships/championships.module';
import { LeaguesModule } from '../leagues/leagues.module';
import { PlayersModule } from '../players/players.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { TeamsModule } from '../teams/teams.module';
import { MatchesModule } from '../matches/matches.module';
import { LegaVolleyCatalogService } from './lega-volley-catalog.service';

@Module({
  imports: [
    SeasonsModule,
    ChampionshipsModule,
    LeaguesModule,
    TeamsModule,
    PlayersModule,
    MatchesModule,
  ],
  providers: [LegaVolleyCatalogService],
  exports: [LegaVolleyCatalogService],
})
export class LegaVolleyModule {}
