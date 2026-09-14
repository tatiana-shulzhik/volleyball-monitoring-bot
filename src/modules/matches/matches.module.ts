import { Module } from '@nestjs/common';
import { LeaguesRepository } from '../../databases/repositories/leagues.repository';
import { MatchesRepository } from '../../databases/repositories/matches.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import { PlayersModule } from '../players/players.module';
import { MatchesService } from './matches.service';

@Module({
  imports: [PlayersModule],
  providers: [
    MatchesService,
    MatchesRepository,
    LeaguesRepository,
    TeamsRepository,
    TeamLeaguesRepository,
  ],
  exports: [MatchesService, MatchesRepository],
})
export class MatchesModule {}
