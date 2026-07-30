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

  findAll(): Promise<ChampionshipsEntity[]> {
    return this.repository.find();
  }

  findByExternalIds(externalIds: number[]): Promise<ChampionshipsEntity[]> {
    return this.repository.find({
      where: { externalId: In(externalIds) },
    });
  }

  findFinishedBySeasonId(
    seasonId: number,
    now: Date,
  ): Promise<ChampionshipsEntity[]> {
    return this.repository
      .createQueryBuilder('championship')
      .innerJoin('championship.stages', 'stage')
      .where('stage.season_id = :seasonId', { seasonId })
      .andWhere('stage.ends_at < :now', { now })
      .distinct(true)
      .orderBy('championship.name', 'ASC')
      .getMany();
  }

  findBySeasonName(seasonName: string): Promise<ChampionshipsEntity[]> {
    return this.repository
      .createQueryBuilder('championship')
      .innerJoin('championship.stages', 'stage')
      .innerJoin('stage.season', 'season')
      .where('season.name = :seasonName', { seasonName })
      .distinct(true)
      .orderBy('championship.name', 'ASC')
      .getMany();
  }

  findActive(now: Date): Promise<ChampionshipsEntity[]> {
    return this.repository
      .createQueryBuilder('championship')
      .innerJoin('championship.stages', 'stage')
      .where('stage.starts_at <= :now', { now })
      .andWhere('stage.ends_at >= :now', { now })
      .distinct(true)
      .getMany();
  }

  findStarted(now: Date): Promise<ChampionshipsEntity[]> {
    return this.repository
      .createQueryBuilder('championship')
      .innerJoin('championship.stages', 'stage')
      .where('stage.starts_at <= :now', { now })
      .distinct(true)
      .getMany();
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
