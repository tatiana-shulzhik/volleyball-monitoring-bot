import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { LeaguesEntity } from '../entities/leagues.entity';

@Injectable()
export class LeaguesRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(LeaguesEntity)
    private readonly repository: Repository<LeaguesEntity>,
  ) {}

  useTransaction<T>(
    manager: EntityManager | undefined,
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return manager ? action(manager) : this.dataSource.transaction(action);
  }

  getWhere(
    where: FindOptionsWhere<LeaguesEntity>,
    manager?: EntityManager,
  ): Promise<LeaguesEntity[]> {
    const repository = manager?.getRepository(LeaguesEntity) ?? this.repository;

    return repository.find({
      where,
      relations: { stage: { championship: true, season: true } },
    });
  }

  insertMany(leagues: Partial<LeaguesEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(LeaguesEntity) ?? this.repository;

    return repository.insert(leagues);
  }

  updateMany(leagues: Partial<LeaguesEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(LeaguesEntity) ?? this.repository;
    const values = leagues.map(({ externalId, name, stage }) => ({
      externalId,
      name,
      stage,
    }));

    return repository.upsert(values, {
      conflictPaths: ['externalId', 'stage'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository = manager?.getRepository(LeaguesEntity) ?? this.repository;

    return repository.delete(ids);
  }
}
