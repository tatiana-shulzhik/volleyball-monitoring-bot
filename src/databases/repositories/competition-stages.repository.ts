import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { CompetitionStagesEntity } from '../entities/competition-stages.entity';

@Injectable()
export class CompetitionStagesRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(CompetitionStagesEntity)
    private readonly repository: Repository<CompetitionStagesEntity>,
  ) {}

  useTransaction<T>(
    manager: EntityManager | undefined,
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return manager ? action(manager) : this.dataSource.transaction(action);
  }

  getWhere(
    where: FindOptionsWhere<CompetitionStagesEntity>,
    manager?: EntityManager,
  ): Promise<CompetitionStagesEntity[]> {
    const repository =
      manager?.getRepository(CompetitionStagesEntity) ?? this.repository;

    return repository.find({
      where,
      relations: { championship: true, season: true },
    });
  }

  hasCalendarMetadata(): Promise<boolean> {
    return this.repository
      .createQueryBuilder('stage')
      .where('stage.starts_at IS NOT NULL')
      .andWhere('stage.ends_at IS NOT NULL')
      .andWhere('stage.season_id IS NOT NULL')
      .getExists();
  }

  insertMany(
    stages: Partial<CompetitionStagesEntity>[],
    manager?: EntityManager,
  ) {
    return (
      manager?.getRepository(CompetitionStagesEntity) ?? this.repository
    ).insert(stages);
  }

  updateMany(stages: CompetitionStagesEntity[], manager?: EntityManager) {
    const repository =
      manager?.getRepository(CompetitionStagesEntity) ?? this.repository;
    const values = stages.map(
      ({ externalId, name, startsAt, endsAt, season, championship }) => ({
        externalId,
        name,
        startsAt,
        endsAt,
        season,
        championship,
      }),
    );

    return repository.upsert(values, {
      conflictPaths: ['externalId', 'championship'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    return (
      manager?.getRepository(CompetitionStagesEntity) ?? this.repository
    ).delete(ids);
  }
}
