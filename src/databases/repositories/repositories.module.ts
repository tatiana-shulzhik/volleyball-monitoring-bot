import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../../configs/config.module';
import { DbConfig } from '../../configs/db.config';
import { ChampionshipsEntity } from '../entities/championships.entity';
import { LeaguesEntity } from '../entities/leagues.entity';
import { PlayerTeamSeasonEntity } from '../entities/player-team-season.entity';
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
      PlayerTeamSeasonEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class RepositoriesModule {}
