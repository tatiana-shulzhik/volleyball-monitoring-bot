import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
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

  findByChampionshipIds(
    championshipIds: number[],
  ): Promise<CompetitionStagesEntity[]> {
    return this.repository.find({
      where: { championship: { id: In(championshipIds) } },
      relations: { championship: { season: true } },
    });
  }

  findByChampionshipId(
    championshipId: number,
  ): Promise<CompetitionStagesEntity[]> {
    return this.repository.find({
      select: { id: true, name: true },
      where: { championship: { id: championshipId } },
      order: { name: 'ASC' },
    });
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
    const values = stages.map(({ externalId, name, championship }) => ({
      externalId,
      name,
      championship,
    }));

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
