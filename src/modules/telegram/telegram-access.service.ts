import { Injectable } from '@nestjs/common';
import { TelegramAccessRepository } from '../../databases/repositories/telegram-access.repository';

@Injectable()
export class TelegramAccessService {
  constructor(private readonly repository: TelegramAccessRepository) {}

  isAllowed(username: string | undefined): Promise<boolean> {
    return username
      ? this.repository.isAllowed(username.toLowerCase())
      : Promise.resolve(false);
  }
}
