import { Module } from '@nestjs/common';
import { ChampionshipsModule } from '../championships/championships.module';
import { LeaguesModule } from '../leagues/leagues.module';
import { MatchesModule } from '../matches/matches.module';
import { PlayersModule } from '../players/players.module';
import { SeasonsModule } from '../seasons/seasons.module';
import { TeamsModule } from '../teams/teams.module';
import { SynchronizationController } from './synchronization.controller';
import { SynchronizationService } from './synchronization.service';

@Module({
  imports: [
    SeasonsModule,
    ChampionshipsModule,
    LeaguesModule,
    MatchesModule,
    TeamsModule,
    PlayersModule,
  ],
  controllers: [SynchronizationController],
  providers: [SynchronizationService],
})
export class SynchronizationModule {}
