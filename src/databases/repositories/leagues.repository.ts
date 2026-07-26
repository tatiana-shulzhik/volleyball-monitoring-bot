import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
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

  findByChampionshipIds(championshipIds: number[]): Promise<LeaguesEntity[]> {
    return this.repository.find({
      where: { championship: { id: In(championshipIds) } },
      relations: { championship: { season: true } },
    });
  }

  insertMany(leagues: Partial<LeaguesEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(LeaguesEntity) ?? this.repository;

    return repository.insert(leagues);
  }

  updateMany(leagues: LeaguesEntity[], manager?: EntityManager) {
    const repository = manager?.getRepository(LeaguesEntity) ?? this.repository;
    const values = leagues.map(({ externalId, name, championship }) => ({
      externalId,
      name,
      championship,
    }));

    return repository.upsert(values, {
      conflictPaths: ['externalId'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository = manager?.getRepository(LeaguesEntity) ?? this.repository;

    return repository.delete(ids);
  }
}
