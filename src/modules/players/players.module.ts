import { Module } from '@nestjs/common';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { PlayersService } from './players.service';

@Module({
  providers: [PlayersService, PlayersRepository, PlayerTeamLeaguesRepository],
  exports: [PlayersService, PlayersRepository],
})
export class PlayersModule {}
