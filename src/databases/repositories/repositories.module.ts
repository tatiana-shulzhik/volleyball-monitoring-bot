import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../../configs/config.module';
import { DbConfig } from '../../configs/db.config';
import { ChampionshipsEntity } from '../entities/championships.entity';
import { LeaguesEntity } from '../entities/leagues.entity';
import { SeasonsEntity } from '../entities/seasons.entity';

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
    ]),
  ],
  exports: [TypeOrmModule],
})
export class RepositoriesModule {}
