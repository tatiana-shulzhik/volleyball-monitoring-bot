import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { ChampionshipsEntity } from '../entities/championships.entity';

@Injectable()
export class ChampionshipsRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(ChampionshipsEntity)
    private readonly repository: Repository<ChampionshipsEntity>,
  ) {}

  useTransaction<T>(
    manager: EntityManager | undefined,
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return manager ? action(manager) : this.dataSource.transaction(action);
  }

  getWhere(
    where: FindOptionsWhere<ChampionshipsEntity>,
    manager?: EntityManager,
  ): Promise<ChampionshipsEntity[]> {
    const repository =
      manager?.getRepository(ChampionshipsEntity) ?? this.repository;

    return repository.find({ where });
  }

  insertMany(
    championships: Partial<ChampionshipsEntity>[],
    manager?: EntityManager,
  ) {
    return (
      manager?.getRepository(ChampionshipsEntity) ?? this.repository
    ).insert(championships);
  }

  updateMany(championships: ChampionshipsEntity[], manager?: EntityManager) {
    const repository =
      manager?.getRepository(ChampionshipsEntity) ?? this.repository;
    const values = championships.map(
      ({ externalId, name, competitionType }) => ({
        externalId,
        name,
        competitionType,
      }),
    );

    return repository.upsert(values, {
      conflictPaths: ['externalId'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    return (
      manager?.getRepository(ChampionshipsEntity) ?? this.repository
    ).delete(ids);
  }
}
