import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { splitIntoBatches } from '../../shared/array.utils';
import { LegaMatchPlayerStatisticsEntity } from '../entities/lega-match-stats.entity';

@Injectable()
export class LegaMatchPlayerStatisticsRepository {
  constructor(
    @InjectRepository(LegaMatchPlayerStatisticsEntity)
    private readonly repository: Repository<LegaMatchPlayerStatisticsEntity>,
  ) {}

  async upsertMany(
    rows: Partial<LegaMatchPlayerStatisticsEntity>[],
    manager?: EntityManager,
  ): Promise<void> {
    const repository =
      manager?.getRepository(LegaMatchPlayerStatisticsEntity) ??
      this.repository;

    for (const batch of splitIntoBatches(rows)) {
      await repository.upsert(batch, {
        conflictPaths: ['match', 'player', 'team'],
        skipUpdateIfNoValuesChanged: true,
      });
    }
  }
}
