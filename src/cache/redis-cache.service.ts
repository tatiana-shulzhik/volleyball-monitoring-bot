import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisCacheService {
  private readonly logger = new Logger(RedisCacheService.name);

  constructor(@InjectRedis() private readonly client: Redis) {
    this.client.on('error', () => undefined);
    this.client.on('ready', () => this.logger.log('Redis cache connected'));
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.client.status !== 'ready') {
      return null;
    }

    try {
      const value = await this.client.get(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch (error) {
      this.logger.warn(`Redis GET failed: ${this.getErrorMessage(error)}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (this.client.status !== 'ready') {
      return;
    }

    try {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`Redis SET failed: ${this.getErrorMessage(error)}`);
    }
  }

  async deleteByPattern(pattern: string): Promise<void> {
    if (this.client.status !== 'ready') {
      return;
    }

    try {
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );

        cursor = nextCursor;

        if (keys.length) {
          await this.client.unlink(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(`Redis DELETE failed: ${this.getErrorMessage(error)}`);
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
