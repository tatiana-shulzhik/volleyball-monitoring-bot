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

  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    if (!keys.length || this.client.status !== 'ready') {
      return new Map();
    }

    try {
      const values = await this.client.mget(...keys);
      const result = new Map<string, T>();

      values.forEach((value, index) => {
        if (value !== null) {
          result.set(keys[index], JSON.parse(value) as T);
        }
      });

      return result;
    } catch (error) {
      this.logger.warn(`Redis MGET failed: ${this.getErrorMessage(error)}`);
      return new Map();
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

  async setMany<T>(
    entries: Array<{ key: string; value: T; ttlSeconds: number }>,
  ): Promise<void> {
    if (!entries.length || this.client.status !== 'ready') {
      return;
    }

    try {
      const pipeline = this.client.pipeline();
      entries.forEach(({ key, value, ttlSeconds }) =>
        pipeline.set(key, JSON.stringify(value), 'EX', ttlSeconds),
      );
      const results = await pipeline.exec();
      const failed = results?.find(([error]) => error);

      if (failed?.[0]) {
        this.logger.warn(
          `Redis pipeline SET failed: ${this.getErrorMessage(failed[0])}`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Redis pipeline SET failed: ${this.getErrorMessage(error)}`,
      );
    }
  }

  async acquire(key: string, ttlSeconds: number): Promise<boolean> {
    if (this.client.status !== 'ready') {
      return true;
    }

    try {
      const result = await this.client.set(key, '1', 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.warn(`Redis acquire failed: ${this.getErrorMessage(error)}`);
      return true;
    }
  }

  async delete(key: string): Promise<void> {
    if (this.client.status !== 'ready') {
      return;
    }

    try {
      await this.client.del(key);
    } catch (error) {
      this.logger.warn(`Redis DELETE failed: ${this.getErrorMessage(error)}`);
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
