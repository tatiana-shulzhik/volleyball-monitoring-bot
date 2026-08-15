import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SynchronizationStateEntity } from '../entities/synchronization-state.entity';
import { SourcesEntity } from '../entities/sources.entity';
import { ESourceCode } from '../../shared/enums';

@Injectable()
export class SynchronizationStateRepository {
  constructor(
    @InjectRepository(SynchronizationStateEntity)
    private readonly repository: Repository<SynchronizationStateEntity>,
    @InjectRepository(SourcesEntity)
    private readonly sourcesRepository: Repository<SourcesEntity>,
  ) {}

  hasCompleted(key: string): Promise<boolean> {
    return this.repository.exists({ where: { key } });
  }

  async markCompleted(key: string): Promise<void> {
    const source = await this.sourcesRepository.findOneByOrFail({ code: ESourceCode.Cev });
    await this.repository.upsert(
      { key, source, completedAt: new Date() },
      { conflictPaths: ['key'] },
    );
  }
}
