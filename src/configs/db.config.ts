import { Injectable } from '@nestjs/common';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { SeasonsEntity } from '../databases/entities/seasons.entity';
import { ConfigService } from './config.service';

@Injectable()
export class DbConfig implements TypeOrmOptionsFactory {
  public readonly dbHost: string;
  public readonly dbPort: number;
  public readonly dbUsername: string;
  public readonly dbPassword: string;
  public readonly dbDatabase: string;

  constructor(configService: ConfigService) {
    this.dbHost = configService.getString('POSTGRES_HOST');
    this.dbPort = configService.getNumber('POSTGRES_PORT');
    this.dbUsername = configService.getString('POSTGRES_USER');
    this.dbPassword = configService.getString('POSTGRES_PASSWORD');
    this.dbDatabase = configService.getString('POSTGRES_DB');
  }

  createTypeOrmOptions(): TypeOrmModuleOptions | Promise<TypeOrmModuleOptions> {
    return {
      type: 'postgres',
      host: this.dbHost,
      port: this.dbPort,
      username: this.dbUsername,
      password: this.dbPassword,
      database: this.dbDatabase,
      migrationsTableName: 'migrations',
      migrationsRun: true,
      synchronize: true,
      entities: [SeasonsEntity],
      migrations: [],
    };
  }
}
