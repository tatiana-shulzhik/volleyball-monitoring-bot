import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SeasonsEntity } from '../entities/seasons.entity';

@Injectable()
export class SeasonsRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(SeasonsEntity)
    private readonly repository: Repository<SeasonsEntity>,
  ) {}

  public useTransaction<T>(
    manager: EntityManager | undefined,
    fn: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return manager ? fn(manager) : this.dataSource.transaction(fn);
  }

  async findAll() {
    return this.repository.find();
  }

  async insertMany(seasons: Partial<SeasonsEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(SeasonsEntity) ?? this.repository;

    return repository.insert(seasons);
  }

  async updateMany(seasons: SeasonsEntity[], manager?: EntityManager) {
    const repository = manager?.getRepository(SeasonsEntity) ?? this.repository;
    const values = seasons.map(
      ({ externalId, name, isCurrent, yearStart, yearEnd }) => ({
        externalId,
        name,
        isCurrent,
        yearStart,
        yearEnd,
      }),
    );

    return repository.upsert(values, {
      conflictPaths: ['externalId'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  async deleteMany(ids: number[], manager?: EntityManager) {
    const repository = manager?.getRepository(SeasonsEntity) ?? this.repository;

    return repository.delete(ids);
  }

  async deleteOutdated(
    beforeYear: number,
    manager?: EntityManager,
  ): Promise<number> {
    const repository = manager?.getRepository(SeasonsEntity) ?? this.repository;
    const result = await repository
      .createQueryBuilder()
      .delete()
      .where('year_end < :beforeYear', { beforeYear })
      .execute();

    return result.affected ?? 0;
  }
}
