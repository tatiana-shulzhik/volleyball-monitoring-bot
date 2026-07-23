import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  public ping(): string {
    return 'pong';
  }
}
