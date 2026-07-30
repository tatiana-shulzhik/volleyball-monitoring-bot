import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

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
