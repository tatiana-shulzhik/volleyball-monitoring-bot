import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { splitIntoBatches } from '../../shared/array.utils';
import { PlayerStatisticsEntity } from '../entities/player-statistics.entity';

@Injectable()
export class PlayerStatisticsRepository {
  constructor(
    @InjectRepository(PlayerStatisticsEntity)
    private readonly repository: Repository<PlayerStatisticsEntity>,
  ) {}

  getWhere(
    where: FindOptionsWhere<PlayerStatisticsEntity>,
    manager?: EntityManager,
  ): Promise<PlayerStatisticsEntity[]> {
    const repository =
      manager?.getRepository(PlayerStatisticsEntity) ?? this.repository;

    return repository.find({
      where,
      relations: { player: true, stage: { season: true } },
    });
  }

  async upsertMany(
    statistics: Partial<PlayerStatisticsEntity>[],
  ): Promise<void> {
    for (const batch of splitIntoBatches(statistics)) {
      await this.repository.upsert(batch, {
        conflictPaths: ['player', 'team', 'stage'],
        skipUpdateIfNoValuesChanged: true,
      });
    }
  }
}
