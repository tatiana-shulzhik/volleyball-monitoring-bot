import { Injectable } from '@nestjs/common';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { ChampionshipsEntity } from '../databases/entities/championships.entity';
import { LeaguesEntity } from '../databases/entities/leagues.entity';
import { MatchEntity } from '../databases/entities/match.entity';
import { PlayerTeamLeagueEntity } from '../databases/entities/player-team-league.entity';
import { PlayersEntity } from '../databases/entities/players.entity';
import { SeasonsEntity } from '../databases/entities/seasons.entity';
import { CompetitionStagesEntity } from '../databases/entities/competition-stages.entity';
import { TeamLeagueEntity } from '../databases/entities/team-league.entity';
import { TeamEntity } from '../databases/entities/team.entity';
import { SynchronizationStateEntity } from '../databases/entities/synchronization-state.entity';
import { MatchPlayerAttackStatisticsEntity } from '../databases/entities/match-player-attack-statistics.entity';
import { ConfigService } from './config.service';

@Injectable()
export class DbConfig implements TypeOrmOptionsFactory {
  public readonly dbHost: string;
  public readonly dbPort: number;
  public readonly dbUsername: string;
  public readonly dbPassword: string;
  public readonly dbDatabase: string;

  constructor(configService: ConfigService) {
    this.dbHost = configService.getString('POSTGRES_HOST');
    this.dbPort = configService.getNumber('POSTGRES_PORT');
    this.dbUsername = configService.getString('POSTGRES_USER');
    this.dbPassword = configService.getString('POSTGRES_PASSWORD');
    this.dbDatabase = configService.getString('POSTGRES_DB');
  }

  createTypeOrmOptions(): TypeOrmModuleOptions | Promise<TypeOrmModuleOptions> {
    return {
      type: 'postgres',
      host: this.dbHost,
      port: this.dbPort,
      username: this.dbUsername,
      password: this.dbPassword,
      database: this.dbDatabase,
      migrationsTableName: 'migrations',
      migrationsRun: false,
      synchronize: true,
      entities: [
        SeasonsEntity,
        ChampionshipsEntity,
        CompetitionStagesEntity,
        LeaguesEntity,
        TeamEntity,
        TeamLeagueEntity,
        PlayersEntity,
        PlayerTeamLeagueEntity,
        MatchEntity,
        MatchPlayerAttackStatisticsEntity,
        SynchronizationStateEntity,
      ],
      migrations: [],
    };
  }
}
