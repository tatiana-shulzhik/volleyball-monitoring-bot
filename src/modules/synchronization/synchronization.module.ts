import { Module } from '@nestjs/common';
import { CevCatalogModule } from '../cev/cev-catalog.module';
import { SynchronizationService } from './synchronization.service';
import { SynchronizationStateRepository } from '../../databases/repositories/synchronization-state.repository';
import { LegaVolleyModule } from '../lega-volley/lega-volley.module';
import { LegaVolleyFemminileModule } from '../lega-volley-femminile/lega-volley-femminile.module';
import { MatchesModule } from '../matches/matches.module';
import { PlayersModule } from '../players/players.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { TeamsModule } from '../teams/teams.module';

@Module({
  imports: [
    CevCatalogModule,
    LegaVolleyModule,
    LegaVolleyFemminileModule,
    MatchesModule,
    PlayersModule,
    SeasonsModule,
    TeamsModule,
  ],
  providers: [SynchronizationService, SynchronizationStateRepository],
})
export class SynchronizationModule {}
