import { Module } from '@nestjs/common';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { MatchesRepository } from '../../databases/repositories/matches.repository';
import { TeamsRepository } from '../../databases/repositories/teams.repository';
import { MatchPlayerAttackStatisticsRepository } from '../../databases/repositories/match-player-attack-statistics.repository';
import { LegaMatchPlayerStatisticsRepository } from '../../databases/repositories/lega-match-player-statistics.repository';
import { RedisCacheModule } from '../../cache/redis-cache.module';
import { PlayersService } from './players.service';
import { PlayerStatisticsService } from './player-statistics.service';

@Module({
  imports: [RedisCacheModule],
  providers: [
    PlayersService,
    PlayerStatisticsService,
    PlayersRepository,
    PlayerTeamLeaguesRepository,
    MatchesRepository,
    MatchPlayerAttackStatisticsRepository,
    LegaMatchPlayerStatisticsRepository,
    TeamsRepository,
  ],
  exports: [
    PlayersService,
    PlayerStatisticsService,
    PlayersRepository,
    PlayerTeamLeaguesRepository,
  ],
})
export class PlayersModule {}
