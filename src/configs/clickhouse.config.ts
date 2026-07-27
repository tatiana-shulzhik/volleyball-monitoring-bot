import { Injectable } from '@nestjs/common';
import { ConfigService } from './config.service';

@Injectable()
export class ClickHouseConfig {
  public readonly url: string;
  public readonly database: string;
  public readonly username: string;
  public readonly password: string;

  constructor(configService: ConfigService) {
    const host = configService.getString('CLICKHOUSE_HOST');
    const port = configService.getNumber('CLICKHOUSE_HTTP_PORT');

    this.url = `http://${host}:${port}`;
    this.database = configService.getString('CLICKHOUSE_DB');
    this.username = configService.getString('CLICKHOUSE_USER');
    this.password = configService.getString('CLICKHOUSE_PASSWORD');
  }
}
