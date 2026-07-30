import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SynchronizationStateEntity } from '../entities/synchronization-state.entity';

@Injectable()
export class SynchronizationStateRepository {
  constructor(
    @InjectRepository(SynchronizationStateEntity)
    private readonly repository: Repository<SynchronizationStateEntity>,
  ) {}

  hasCompleted(key: string): Promise<boolean> {
    return this.repository.exists({ where: { key } });
  }

  async markCompleted(key: string): Promise<void> {
    await this.repository.upsert(
      { key, completedAt: new Date() },
      { conflictPaths: ['key'] },
    );
  }
}
