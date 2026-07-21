import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('ping')
export class HealthController {

  private readonly healthService: HealthService;

  constructor(healthService: HealthService) {
    this.healthService = healthService;
  }

  @Get('/')
  public ping(): string {
    return this.healthService.ping();
  }

}
