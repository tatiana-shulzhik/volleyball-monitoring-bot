import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramAccessEntity } from '../entities/telegram-access.entity';

@Injectable()
export class TelegramAccessRepository {
  constructor(
    @InjectRepository(TelegramAccessEntity)
    private readonly repository: Repository<TelegramAccessEntity>,
  ) {}

  isAllowed(username: string): Promise<boolean> {
    return this.repository.existsBy({ username });
  }
}
