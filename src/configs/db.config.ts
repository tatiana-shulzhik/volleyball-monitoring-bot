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
import { SourcesEntity } from '../databases/entities/sources.entity';
import { TelegramAccessEntity } from '../databases/entities/telegram-access.entity';
import { CreateSources1760000000000 } from '../databases/migrations/1760000000000-CreateSources';
import { CreateSeasons1760000001000 } from '../databases/migrations/1760000001000-CreateSeasons';
import { CreateChampionships1760000002000 } from '../databases/migrations/1760000002000-CreateChampionships';
import { CreateCompetitionStages1760000003000 } from '../databases/migrations/1760000003000-CreateCompetitionStages';
import { CreateLeagues1760000004000 } from '../databases/migrations/1760000004000-CreateLeagues';
import { CreateTeams1760000005000 } from '../databases/migrations/1760000005000-CreateTeams';
import { CreateTeamLeagues1760000006000 } from '../databases/migrations/1760000006000-CreateTeamLeagues';
import { CreatePlayers1760000007000 } from '../databases/migrations/1760000007000-CreatePlayers';
import { CreatePlayerTeamLeagues1760000008000 } from '../databases/migrations/1760000008000-CreatePlayerTeamLeagues';
import { CreateMatches1760000009000 } from '../databases/migrations/1760000009000-CreateMatches';
import { CreateMatchPlayerAttackStatistics1760000010000 } from '../databases/migrations/1760000010000-CreateMatchPlayerAttackStatistics';
import { CreateSynchronizationState1760000011000 } from '../databases/migrations/1760000011000-CreateSynchronizationState';
import { AddSourceColumns1760000011500 } from '../databases/migrations/1760000011500-AddSourceColumns';
import { MarkExistingCevData1760000012000 } from '../databases/migrations/1760000012000-MarkExistingCevData';
import { SeedLegaVolleySource1760000013000 } from '../databases/migrations/1760000013000-SeedLegaVolleySource';
import { ScopeLeagueExternalIdByStage1760000014000 } from '../databases/migrations/1760000014000-ScopeLeagueExternalIdByStage';
import { CreateTelegramAccess1760000016000 } from '../databases/migrations/1760000016000-CreateTelegramAccess';
import { MakeLegaMatchExternalIdNullable1760000017000 } from '../databases/migrations/1760000017000-MakeLegaMatchExternalIdNullable';
import { DropLegaMatchPlayerStatistics1760000018000 } from '../databases/migrations/1760000018000-DropLegaMatchPlayerStatistics';
import { SeedLegaVolleyFemminileSource1760000019000 } from '../databases/migrations/1760000019000-SeedLegaVolleyFemminileSource';
import { ScopeExternalIdsBySource1760000020000 } from '../databases/migrations/1760000020000-ScopeExternalIdsBySource';
import { AddLiveMatchesNotificationToSources1760000021000 } from '../databases/migrations/1760000021000-AddLiveMatchesNotificationToSources';
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
      migrationsRun: true,
      synchronize: false,
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
        SourcesEntity,
        TelegramAccessEntity,
      ],
      migrations: [
        CreateSources1760000000000,
        CreateSeasons1760000001000,
        CreateChampionships1760000002000,
        CreateCompetitionStages1760000003000,
        CreateLeagues1760000004000,
        CreateTeams1760000005000,
        CreateTeamLeagues1760000006000,
        CreatePlayers1760000007000,
        CreatePlayerTeamLeagues1760000008000,
        CreateMatches1760000009000,
        CreateMatchPlayerAttackStatistics1760000010000,
        CreateSynchronizationState1760000011000,
        AddSourceColumns1760000011500,
        MarkExistingCevData1760000012000,
        SeedLegaVolleySource1760000013000,
        ScopeLeagueExternalIdByStage1760000014000,
        CreateTelegramAccess1760000016000,
        MakeLegaMatchExternalIdNullable1760000017000,
        DropLegaMatchPlayerStatistics1760000018000,
        SeedLegaVolleyFemminileSource1760000019000,
        ScopeExternalIdsBySource1760000020000,
        AddLiveMatchesNotificationToSources1760000021000,
      ],
    };
  }
}
