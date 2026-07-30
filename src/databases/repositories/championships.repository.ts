import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  LessThan,
  LessThanOrEqual,
  MoreThanOrEqual,
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

  findAll(): Promise<ChampionshipsEntity[]> {
    return this.repository.find({ relations: { season: true } });
  }

  findBySeasonIds(seasonIds: number[]): Promise<ChampionshipsEntity[]> {
    return this.repository.find({
      where: { season: { id: In(seasonIds) } },
      relations: { season: true },
      order: { startsAt: 'ASC', name: 'ASC' },
    });
  }

  findFinishedBySeasonId(
    seasonId: number,
    now: Date,
  ): Promise<ChampionshipsEntity[]> {
    return this.repository.find({
      where: { season: { id: seasonId }, endsAt: LessThan(now) },
      order: { startsAt: 'ASC', name: 'ASC' },
    });
  }

  findActive(now: Date): Promise<ChampionshipsEntity[]> {
    return this.repository.find({
      where: { startsAt: LessThanOrEqual(now), endsAt: MoreThanOrEqual(now) },
      relations: { season: true },
    });
  }

  findStarted(now: Date): Promise<ChampionshipsEntity[]> {
    return this.repository.find({
      where: { startsAt: LessThanOrEqual(now) },
      relations: { season: true },
    });
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
      ({ externalId, name, startsAt, endsAt, competitionType, season }) => ({
        externalId,
        name,
        startsAt,
        endsAt,
        competitionType,
        season,
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
