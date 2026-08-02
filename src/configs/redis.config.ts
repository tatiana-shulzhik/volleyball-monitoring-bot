import {
  RedisModuleOptions,
  RedisModuleOptionsFactory,
} from '@nestjs-modules/ioredis';
import { Injectable } from '@nestjs/common';
import { ConfigService } from './config.service';

@Injectable()
export class RedisConfig implements RedisModuleOptionsFactory {
  public readonly host: string;
  public readonly port: number;
  public readonly password?: string;

  constructor(configService: ConfigService) {
    this.host = configService.getString('REDIS_HOST') || 'localhost';
    this.port = configService.getNumber('REDIS_PORT') || 6379;
    this.password = configService.getString('REDIS_PASSWORD') || undefined;
  }

  createRedisModuleOptions(): RedisModuleOptions {
    return {
      type: 'single',
      url: `redis://${this.password ? `:${this.password}@` : ''}${this.host}:${this.port}`,
    };
  }
}
