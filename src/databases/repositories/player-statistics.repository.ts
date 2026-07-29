import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayerStatisticsEntity } from '../entities/player-statistics.entity';

@Injectable()
export class PlayerStatisticsRepository {
  constructor(
    @InjectRepository(PlayerStatisticsEntity)
    private readonly repository: Repository<PlayerStatisticsEntity>,
  ) {}

  upsertMany(statistics: Partial<PlayerStatisticsEntity>[]): Promise<unknown> {
    if (!statistics.length) {
      return Promise.resolve();
    }

    return this.repository.upsert(statistics, {
      conflictPaths: ['player', 'team', 'season'],
      skipUpdateIfNoValuesChanged: true,
    });
  }
}
