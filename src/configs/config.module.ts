import { Global, Module } from '@nestjs/common';
import * as NestConfig from '@nestjs/config';
import { AppConfig } from './app.config';
import { ConfigService } from './config.service';
import { DbConfig } from './db.config';
import { RedisConfig } from './redis.config';
import { TelegramConfig } from './telegram.config';

@Global()
@Module({
  imports: [
    NestConfig.ConfigModule.forRoot({
      envFilePath: ['.env'],
    }),
  ],
  providers: [ConfigService, AppConfig, DbConfig, RedisConfig, TelegramConfig],
  exports: [ConfigService, AppConfig, DbConfig, RedisConfig, TelegramConfig],
})
export class ConfigModule {}
