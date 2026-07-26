import { Injectable } from '@nestjs/common';
import { ISwaggerConfig } from '../interfaces/configs/swagger.models';
import { ConfigService } from './config.service';

@Injectable()
export class SwaggerConfig implements ISwaggerConfig {
  public readonly username: string;
  public readonly password: string;

  constructor(configService: ConfigService) {
    this.username = configService.getString('SWAGGER_USERNAME');
    this.password = configService.getString('SWAGGER_PASSWORD');
  }
}
