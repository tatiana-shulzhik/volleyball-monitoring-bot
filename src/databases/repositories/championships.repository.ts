import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
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

  findBySeasonIds(seasonIds: number[]): Promise<ChampionshipsEntity[]> {
    return this.repository.find({
      where: { season: { id: In(seasonIds) } },
      relations: { season: true },
    });
  }

  findBySeasonId(seasonId: number): Promise<ChampionshipsEntity[]> {
    return this.repository.find({
      where: { season: { id: seasonId } },
      order: { name: 'ASC' },
    });
  }

  insertMany(
    championships: Partial<ChampionshipsEntity>[],
    manager?: EntityManager,
  ) {
    const repository =
      manager?.getRepository(ChampionshipsEntity) ?? this.repository;

    return repository.insert(championships);
  }

  updateMany(championships: ChampionshipsEntity[], manager?: EntityManager) {
    const repository =
      manager?.getRepository(ChampionshipsEntity) ?? this.repository;
    const values = championships.map(({ externalId, name, season }) => ({
      externalId,
      name,
      season,
    }));

    return repository.upsert(values, {
      conflictPaths: ['externalId'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository =
      manager?.getRepository(ChampionshipsEntity) ?? this.repository;

    return repository.delete(ids);
  }
}
