import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ClickHouseClient, createClient } from '@clickhouse/client';
import { ClickHouseConfig } from '../../configs/clickhouse.config';

@Injectable()
export class ClickHouseService implements OnModuleDestroy {
  public readonly client: ClickHouseClient;

  constructor(config: ClickHouseConfig) {
    this.client = createClient({
      url: config.url,
      database: config.database,
      username: config.username,
      password: config.password,
    });
  }

  async ping(): Promise<boolean> {
    const result = await this.client.ping();
    return result.success;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }
}
