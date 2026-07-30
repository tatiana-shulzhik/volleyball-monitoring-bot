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

  findByStageIds(stageIds: number[]): Promise<LeaguesEntity[]> {
    return this.repository.find({
      where: { stage: { id: In(stageIds) } },
      relations: { stage: { championship: true, season: true } },
    });
  }

  findByStageId(stageId: number): Promise<LeaguesEntity[]> {
    return this.repository.find({
      select: { id: true, name: true },
      where: { stage: { id: stageId } },
      order: { name: 'ASC' },
    });
  }

  findByExternalIds(externalIds: number[]): Promise<LeaguesEntity[]> {
    return this.repository.find({
      where: { externalId: In(externalIds) },
      relations: { stage: { championship: true, season: true } },
    });
  }

  insertMany(leagues: Partial<LeaguesEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(LeaguesEntity) ?? this.repository;

    return repository.insert(leagues);
  }

  updateMany(leagues: LeaguesEntity[], manager?: EntityManager) {
    const repository = manager?.getRepository(LeaguesEntity) ?? this.repository;
    const values = leagues.map(({ externalId, name, stage }) => ({
      externalId,
      name,
      stage,
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
