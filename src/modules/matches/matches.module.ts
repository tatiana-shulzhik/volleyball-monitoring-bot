import { Module } from '@nestjs/common';
import { LeaguesRepository } from '../../databases/repositories/leagues.repository';
import { MatchesRepository } from '../../databases/repositories/matches.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { MatchesService } from './matches.service';

@Module({
  providers: [
    MatchesService,
    MatchesRepository,
    LeaguesRepository,
    TeamsRepository,
  ],
  exports: [MatchesService],
})
export class MatchesModule {}
