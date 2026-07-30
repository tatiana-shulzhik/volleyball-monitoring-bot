import { Module } from '@nestjs/common';
import { ChampionshipsModule } from '../championships/championships.module';
import { LeaguesModule } from '../leagues/leagues.module';
import { MatchesModule } from '../matches/matches.module';
import { PlayersModule } from '../players/players.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { TeamsModule } from '../teams/teams.module';
import { SynchronizationService } from './synchronization.service';
import { SynchronizationStateRepository } from '../../databases/repositories/synchronization-state.repository';

@Module({
  imports: [
    SeasonsModule,
    ChampionshipsModule,
    LeaguesModule,
    MatchesModule,
    TeamsModule,
    PlayersModule,
  ],
  providers: [SynchronizationService, SynchronizationStateRepository],
})
export class SynchronizationModule {}
