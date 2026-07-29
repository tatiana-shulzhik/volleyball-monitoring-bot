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

  hasAny(): Promise<boolean> {
    return this.repository.exists();
  }

  findActive(now: Date): Promise<SeasonsEntity[]> {
    return this.repository
      .createQueryBuilder('season')
      .select(['season.id', 'season.name'])
      .where('season.starts_at <= :now', { now })
      .andWhere('season.ends_at >= :now', { now })
      .orderBy('season.starts_at', 'DESC')
      .getMany();
  }

  findUpcoming(now: Date): Promise<SeasonsEntity[]> {
    return this.repository
      .createQueryBuilder('season')
      .select(['season.id', 'season.name'])
      .where('season.starts_at > :now', { now })
      .orderBy('season.starts_at', 'ASC')
      .getMany();
  }

  findWithIncompleteStatistics(now: Date): Promise<SeasonsEntity[]> {
    return this.repository
      .createQueryBuilder('season')
      .where('season.statistics_loaded = false')
      .andWhere('season.starts_at <= :now', { now })
      .getMany();
  }

  findRequiringStatisticsSync(now: Date): Promise<SeasonsEntity[]> {
    return this.repository
      .createQueryBuilder('season')
      .where('season.starts_at <= :now', { now })
      .andWhere('(season.ends_at >= :now OR season.statistics_loaded = false)')
      .getMany();
  }

  async markStatisticsLoadedIfCompleted(
    seasonIds: number[],
    now: Date,
  ): Promise<void> {
    if (!seasonIds.length) {
      return;
    }

    await this.repository
      .createQueryBuilder()
      .update(SeasonsEntity)
      .set({ statisticsLoaded: true })
      .where('id IN (:...seasonIds)', { seasonIds })
      .andWhere('statistics_loaded = false')
      .andWhere('ends_at < :now', { now })
      .execute();
  }

  async insertMany(seasons: Partial<SeasonsEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(SeasonsEntity) ?? this.repository;

    return repository.insert(seasons);
  }

  async updateMany(seasons: SeasonsEntity[], manager?: EntityManager) {
    const repository = manager?.getRepository(SeasonsEntity) ?? this.repository;
    const values = seasons.map(
      ({
        externalId,
        name,
        competitionType,
        yearStart,
        yearEnd,
        startsAt,
        endsAt,
      }) => ({
        externalId,
        name,
        competitionType,
        yearStart,
        yearEnd,
        startsAt,
        endsAt,
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
