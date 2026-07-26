import { Global, Module } from '@nestjs/common';
import * as NestConfig from '@nestjs/config';
import { AppConfig } from './app.config';
import { ConfigService } from './config.service';
import { DbConfig } from './db.config';
import { SwaggerConfig } from './swagger.config';

@Global()
@Module({
  imports: [
    NestConfig.ConfigModule.forRoot({
      envFilePath: ['.env'],
    }),
  ],
  providers: [ConfigService, AppConfig, DbConfig, SwaggerConfig],
  exports: [ConfigService, AppConfig, DbConfig, SwaggerConfig],
})
export class ConfigModule {}
