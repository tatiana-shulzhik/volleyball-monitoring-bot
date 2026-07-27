import { Module } from '@nestjs/common';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { TeamsService } from './teams.service';

@Module({
  providers: [TeamsService, TeamsRepository, TeamLeaguesRepository],
  exports: [TeamsService, TeamsRepository, TeamLeaguesRepository],
})
export class TeamsModule {}
