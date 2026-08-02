import { RedisModule } from '@nestjs-modules/ioredis';
import { Module } from '@nestjs/common';
import { ConfigModule } from '../configs/config.module';
import { RedisConfig } from '../configs/redis.config';
import { RedisCacheService } from './redis-cache.service';

@Module({
  imports: [
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useExisting: RedisConfig,
    }),
  ],
  providers: [RedisCacheService],
  exports: [RedisCacheService],
})
export class RedisCacheModule {}
