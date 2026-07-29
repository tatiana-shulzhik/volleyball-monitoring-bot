import { Module } from '@nestjs/common';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';
import { PlayerStatisticsRepository } from '../../databases/repositories/player-statistics.repository';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { PlayersService } from './players.service';
import { PlayerStatisticsService } from './player-statistics.service';

@Module({
  providers: [
    PlayersService,
    PlayerStatisticsService,
    PlayersRepository,
    PlayerTeamLeaguesRepository,
    PlayerStatisticsRepository,
  ],
  exports: [PlayersService, PlayerStatisticsService, PlayersRepository],
})
export class PlayersModule {}
