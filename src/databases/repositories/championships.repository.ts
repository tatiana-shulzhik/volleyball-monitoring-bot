import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { ChampionshipsEntity } from '../entities/championships.entity';
import { SourcesEntity } from '../entities/sources.entity';
import { ESourceCode } from '../../shared/enums';

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

  async insertMany(
    championships: Partial<ChampionshipsEntity>[],
    manager?: EntityManager,
  ) {
    const repository =
      manager?.getRepository(ChampionshipsEntity) ?? this.repository;
    const source = await (
      manager?.getRepository(SourcesEntity) ??
      this.repository.manager.getRepository(SourcesEntity)
    ).findOneByOrFail({ code: ESourceCode.Cev });
    return repository.insert(
      championships.map((championship) => ({ ...championship, source })),
    );
  }

  async updateMany(
    championships: Partial<ChampionshipsEntity>[],
    manager?: EntityManager,
    sourceCode = ESourceCode.Cev,
  ) {
    const repository =
      manager?.getRepository(ChampionshipsEntity) ?? this.repository;
    const source = await (
      manager?.getRepository(SourcesEntity) ??
      this.repository.manager.getRepository(SourcesEntity)
    ).findOneByOrFail({ code: sourceCode });
    const values = championships.map(
      ({ externalId, name, competitionType }) => ({
        externalId,
        name,
        competitionType,
        source,
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
