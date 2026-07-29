import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../../configs/config.module';
import { DbConfig } from '../../configs/db.config';
import { ChampionshipsEntity } from '../entities/championships.entity';
import { LeaguesEntity } from '../entities/leagues.entity';
import { MatchEntity } from '../entities/match.entity';
import { PlayerTeamLeagueEntity } from '../entities/player-team-league.entity';
import { PlayerStatisticsEntity } from '../entities/player-statistics.entity';
import { PlayersEntity } from '../entities/players.entity';
import { SeasonsEntity } from '../entities/seasons.entity';
import { TeamLeagueEntity } from '../entities/team-league.entity';
import { TeamEntity } from '../entities/team.entity';

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useClass: DbConfig,
    }),
    TypeOrmModule.forFeature([
      SeasonsEntity,
      ChampionshipsEntity,
      LeaguesEntity,
      TeamEntity,
      TeamLeagueEntity,
      PlayersEntity,
      PlayerTeamLeagueEntity,
      PlayerStatisticsEntity,
      MatchEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class RepositoriesModule {}
