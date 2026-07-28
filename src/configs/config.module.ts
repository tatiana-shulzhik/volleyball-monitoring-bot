import { Global, Module } from '@nestjs/common';
import * as NestConfig from '@nestjs/config';
import { AppConfig } from './app.config';
import { ClickHouseConfig } from './clickhouse.config';
import { ConfigService } from './config.service';
import { DbConfig } from './db.config';
import { SwaggerConfig } from './swagger.config';
import { TelegramConfig } from './telegram.config';

@Global()
@Module({
  imports: [
    NestConfig.ConfigModule.forRoot({
      envFilePath: ['.env'],
    }),
  ],
  providers: [
    ConfigService,
    AppConfig,
    ClickHouseConfig,
    DbConfig,
    SwaggerConfig,
    TelegramConfig,
  ],
  exports: [
    ConfigService,
    AppConfig,
    ClickHouseConfig,
    DbConfig,
    SwaggerConfig,
    TelegramConfig,
  ],
})
export class ConfigModule {}
