import { Injectable } from '@nestjs/common';
import { IAppConfig } from '../interfaces/configs/app.models';
import { ConfigService } from './config.service';

@Injectable()
export class AppConfig implements IAppConfig {
  public readonly name: string;
  public readonly port: number;

  constructor(configService: ConfigService) {
    this.name = configService.getString('APP_NAME');
    this.port = configService.getNumber('APP_PORT');
  }
}
