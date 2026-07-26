import { Module } from '@nestjs/common';
import { PlayerTeamSeasonsRepository } from '../../databases/repositories/player-team-seasons.repository';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { PlayersService } from './players.service';

@Module({
  providers: [PlayersService, PlayersRepository, PlayerTeamSeasonsRepository],
  exports: [PlayersService, PlayersRepository],
})
export class PlayersModule {}
