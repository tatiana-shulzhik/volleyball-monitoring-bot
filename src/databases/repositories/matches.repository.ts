import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  EntityManager,
  FindOptionsWhere,
  IsNull,
  Repository,
} from 'typeorm';
import { EMatchStatus } from '../../shared/enums';
import { MatchEntity } from '../entities/match.entity';

@Injectable()
export class MatchesRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(MatchEntity)
    private readonly repository: Repository<MatchEntity>,
  ) {}

  useTransaction<T>(
    manager: EntityManager | undefined,
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return manager ? action(manager) : this.dataSource.transaction(action);
  }

  getWhere(
    where: FindOptionsWhere<MatchEntity>,
    manager?: EntityManager,
  ): Promise<MatchEntity[]> {
    const repository = manager?.getRepository(MatchEntity) ?? this.repository;

    return repository.find({
      where,
      relations: {
        league: true,
        homeTeam: true,
        awayTeam: true,
      },
    });
  }

  insertMany(matches: Partial<MatchEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(MatchEntity) ?? this.repository;
    return repository.insert(matches);
  }

  updateMany(matches: MatchEntity[], manager?: EntityManager) {
    const repository = manager?.getRepository(MatchEntity) ?? this.repository;
    const values = matches.map(
      ({ externalId, league, homeTeam, awayTeam, scheduledAt, status }) => ({
        externalId,
        league,
        homeTeam,
        awayTeam,
        scheduledAt,
        status,
      }),
    );

    return repository.upsert(values, {
      conflictPaths: ['externalId'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository = manager?.getRepository(MatchEntity) ?? this.repository;
    return repository.delete(ids);
  }

  async startMonitoring(now: Date, windowEnd: Date): Promise<number> {
    const result = await this.repository.update(
      {
        status: EMatchStatus.Scheduled,
        monitoringStartedAt: IsNull(),
        scheduledAt: Between(now, windowEnd),
      },
      { monitoringStartedAt: now },
    );

    return result.affected ?? 0;
  }

  async findCompletedStageIds(stageIds: number[]): Promise<number[]> {
    const rows: Array<{ championship_id: number }> = await this.repository
      .createQueryBuilder('match')
      .innerJoin('match.league', 'league')
      .select('league.stage_id', 'championship_id')
      .where('league.stage_id IN (:...stageIds)', {
        stageIds,
      })
      .groupBy('league.stage_id')
      .having('COUNT(match.id) > 0')
      .andHaving(
        'COUNT(match.id) FILTER (WHERE match.status = :scheduled) = 0',
        { scheduled: EMatchStatus.Scheduled },
      )
      .getRawMany();

    return rows.map(({ championship_id }) => Number(championship_id));
  }
}
