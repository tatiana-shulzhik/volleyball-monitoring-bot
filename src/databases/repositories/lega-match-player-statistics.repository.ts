import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { LegaMatchPlayerStatisticsEntity } from '../entities/lega-match-stats.entity';

@Injectable()
export class LegaMatchPlayerStatisticsRepository {
  constructor(
    @InjectRepository(LegaMatchPlayerStatisticsEntity)
    private readonly repository: Repository<LegaMatchPlayerStatisticsEntity>,
  ) {}

  upsertMany(
    rows: Partial<LegaMatchPlayerStatisticsEntity>[],
    manager?: EntityManager,
  ) {
    return (
      manager?.getRepository(LegaMatchPlayerStatisticsEntity) ?? this.repository
    ).upsert(rows, {
      conflictPaths: ['match', 'player', 'team'],
      skipUpdateIfNoValuesChanged: true,
    });
  }
}
