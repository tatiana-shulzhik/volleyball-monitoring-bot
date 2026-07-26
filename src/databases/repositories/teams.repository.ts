import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { TeamEntity } from '../entities/team.entity';

@Injectable()
export class TeamsRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(TeamEntity)
    private readonly repository: Repository<TeamEntity>,
  ) {}

  useTransaction<T>(
    manager: EntityManager | undefined,
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return manager ? action(manager) : this.dataSource.transaction(action);
  }

  findAll(): Promise<TeamEntity[]> {
    return this.repository.find();
  }

  findByExternalIds(externalIds: string[]): Promise<TeamEntity[]> {
    return this.repository.find({
      where: { externalId: In(externalIds) },
    });
  }

  insertMany(teams: Partial<TeamEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(TeamEntity) ?? this.repository;

    return repository.insert(teams);
  }

  updateMany(teams: TeamEntity[], manager?: EntityManager) {
    const repository = manager?.getRepository(TeamEntity) ?? this.repository;
    const values = teams.map(({ externalId, name }) => ({ externalId, name }));

    return repository.upsert(values, {
      conflictPaths: ['externalId'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository = manager?.getRepository(TeamEntity) ?? this.repository;

    return repository.delete(ids);
  }
}
