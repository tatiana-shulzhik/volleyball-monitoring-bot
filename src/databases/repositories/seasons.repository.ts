import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ECompetitionType } from '../../shared/enums';
import { SeasonsEntity } from '../entities/seasons.entity';

export interface SeasonCycle {
  name: string;
  yearStart: number;
  yearEnd: number;
  competitionType: ECompetitionType;
}

@Injectable()
export class SeasonsRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(SeasonsEntity)
    private readonly repository: Repository<SeasonsEntity>,
  ) {}

  useTransaction<T>(
    manager: EntityManager | undefined,
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return manager ? action(manager) : this.dataSource.transaction(action);
  }

  findAll(): Promise<SeasonsEntity[]> {
    return this.repository.find({
      order: { yearStart: 'ASC', competitionType: 'ASC' },
    });
  }

  findFinished(now: Date): Promise<SeasonsEntity[]> {
    return this.repository
      .createQueryBuilder('season')
      .where(
        'EXISTS (SELECT 1 FROM championships championship ' +
          'WHERE championship.season_id = season.id)',
      )
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM championships championship ' +
          'WHERE championship.season_id = season.id ' +
          'AND championship.ends_at >= :now)',
        { now },
      )
      .orderBy('season.yearStart', 'DESC')
      .addOrderBy('season.competitionType', 'ASC')
      .getMany();
  }

  hasAny(): Promise<boolean> {
    return this.repository.exists();
  }

  upsertMany(seasons: SeasonCycle[], manager?: EntityManager) {
    const repository = manager?.getRepository(SeasonsEntity) ?? this.repository;

    return repository.upsert(seasons, {
      conflictPaths: ['competitionType', 'yearStart', 'yearEnd'],
      skipUpdateIfNoValuesChanged: true,
    });
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
