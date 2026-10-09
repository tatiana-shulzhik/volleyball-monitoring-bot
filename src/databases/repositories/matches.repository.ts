import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  Repository,
} from 'typeorm';
import { EMatchStatus, ESourceCode } from '../../shared/enums';
import { splitIntoBatches } from '../../shared/array.utils';
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
        league: { stage: { championship: { source: true } } },
        homeTeam: true,
        awayTeam: true,
      },
    });
  }

  insertMany(matches: Partial<MatchEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(MatchEntity) ?? this.repository;
    return repository.insert(matches);
  }

  saveMany(matches: Partial<MatchEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(MatchEntity) ?? this.repository;
    return repository.save(matches, { chunk: 1000, reload: false });
  }

  async updateExternalIds(
    matches: Array<{ id: number; externalId: string }>,
  ): Promise<void> {
    for (const batch of splitIntoBatches(matches, 1000)) {
      const params = batch.flatMap(({ id, externalId }) => [id, externalId]);
      const values = batch
        .map(
          (_, index) =>
            `($${index * 2 + 1}::integer, $${index * 2 + 2}::varchar)`,
        )
        .join(', ');
      await this.dataSource.query(
        `UPDATE "matches" AS m
         SET "external_id" = source.external_id
         FROM (VALUES ${values}) AS source(id, external_id)
         WHERE m.id = source.id`,
        params,
      );
    }
  }

  updateMany(
    matches: Partial<MatchEntity>[],
    manager?: EntityManager,
    resetAttackStatistics = true,
  ) {
    const repository = manager?.getRepository(MatchEntity) ?? this.repository;
    const values = matches.map(
      ({ externalId, league, homeTeam, awayTeam, scheduledAt, status }) => ({
        externalId,
        league,
        homeTeam,
        awayTeam,
        scheduledAt,
        status,
        ...(resetAttackStatistics ? { attackStatisticsUpdatedAt: null } : {}),
      }),
    );

    return repository.upsert(values, {
      conflictPaths: ['externalId', 'league'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository = manager?.getRepository(MatchEntity) ?? this.repository;
    return repository.delete(ids);
  }

  findMonitoredWithin(
    sourceCode: ESourceCode,
    start: Date,
    end: Date,
  ): Promise<MatchEntity[]> {
    return this.repository
      .createQueryBuilder('match')
      .innerJoinAndSelect('match.league', 'league')
      .innerJoinAndSelect('league.stage', 'stage')
      .innerJoinAndSelect('stage.championship', 'championship')
      .innerJoinAndSelect('championship.source', 'source')
      .innerJoinAndSelect('match.homeTeam', 'homeTeam')
      .innerJoinAndSelect('match.awayTeam', 'awayTeam')
      .where('match.status = :status', { status: EMatchStatus.Scheduled })
      .andWhere('match.scheduled_at >= :start', { start })
      .andWhere('match.scheduled_at < :end', { end })
      .andWhere('source.code = :sourceCode', { sourceCode })
      .orderBy('match.scheduled_at', 'ASC')
      .getMany();
  }

  findScheduledBetween(
    start: Date,
    end: Date,
    sourceCode?: ESourceCode,
  ): Promise<MatchEntity[]> {
    const query = this.repository
      .createQueryBuilder('match')
      .innerJoinAndSelect('match.league', 'league')
      .innerJoinAndSelect('league.stage', 'stage')
      .innerJoinAndSelect('stage.championship', 'championship')
      .leftJoinAndSelect('championship.source', 'source')
      .innerJoinAndSelect('match.homeTeam', 'homeTeam')
      .innerJoinAndSelect('match.awayTeam', 'awayTeam')
      .where('match.status = :status', { status: EMatchStatus.Scheduled })
      .andWhere('match.scheduled_at >= :start', { start })
      .andWhere('match.scheduled_at < :end', { end })
      .orderBy('source.name', 'ASC')
      .addOrderBy('championship.name', 'ASC')
      .addOrderBy('match.scheduled_at', 'ASC');

    if (sourceCode) {
      query.andWhere('source.code = :sourceCode', { sourceCode });
    }

    return query.getMany();
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

  findFinishedByStageIds(stageIds: number[]): Promise<MatchEntity[]> {
    return this.repository.find({
      where: {
        status: EMatchStatus.Finished,
        league: { stage: { id: In(stageIds) } },
      },
      relations: {
        league: { stage: { championship: true } },
        homeTeam: true,
        awayTeam: true,
      },
    });
  }

  findFinishedRequiringAttackStatistics(
    stageIds: number[],
  ): Promise<MatchEntity[]> {
    return this.repository
      .createQueryBuilder('match')
      .innerJoinAndSelect('match.league', 'league')
      .innerJoinAndSelect('league.stage', 'stage')
      .innerJoinAndSelect('stage.championship', 'championship')
      .innerJoinAndSelect('match.homeTeam', 'homeTeam')
      .innerJoinAndSelect('match.awayTeam', 'awayTeam')
      .where('match.status = :finished', {
        finished: EMatchStatus.Finished,
      })
      .andWhere('stage.id IN (:...stageIds)', { stageIds })
      .andWhere(
        '(match.attack_statistics_updated_at IS NULL OR EXISTS (' +
          'SELECT 1 FROM match_player_attack_statistics attack ' +
          'WHERE attack.match_id = match.id ' +
          'AND (attack.points IS NULL OR attack.sets_played IS NULL)))',
      )
      .getMany();
  }

  findFinishedRequiringLegaStatistics(
    sourceCode = ESourceCode.LegaVolley,
  ): Promise<MatchEntity[]> {
    return this.repository
      .createQueryBuilder('match')
      .innerJoinAndSelect('match.league', 'league')
      .innerJoinAndSelect('league.stage', 'stage')
      .leftJoinAndSelect('stage.season', 'season')
      .innerJoinAndSelect('stage.championship', 'championship')
      .innerJoin('championship.source', 'source')
      .innerJoinAndSelect('match.homeTeam', 'homeTeam')
      .innerJoinAndSelect('match.awayTeam', 'awayTeam')
      .where('match.status = :finished', {
        finished: EMatchStatus.Finished,
      })
      .andWhere('source.code = :sourceCode', {
        sourceCode,
      })
      .andWhere('match.attack_statistics_updated_at IS NULL')
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM match_player_attack_statistics attack ' +
          'WHERE attack.match_id = match.id)',
      )
      .getMany();
  }

  async findStageIdsRequiringAttackStatistics(): Promise<number[]> {
    const rows: Array<{ stageId: string }> = await this.repository
      .createQueryBuilder('match')
      .innerJoin('match.league', 'league')
      .select('DISTINCT league.stage_id', 'stageId')
      .where('match.status = :finished', {
        finished: EMatchStatus.Finished,
      })
      .andWhere(
        '(match.attack_statistics_updated_at IS NULL OR EXISTS (' +
          'SELECT 1 FROM match_player_attack_statistics attack ' +
          'WHERE attack.match_id = match.id ' +
          'AND (attack.points IS NULL OR attack.sets_played IS NULL)))',
      )
      .getRawMany();

    return rows.map(({ stageId }) => Number(stageId));
  }

  async markAttackStatisticsLoaded(
    ids: number[],
    sourceUpdatedAt: Date,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager?.getRepository(MatchEntity) ?? this.repository;
    await repository.update(
      { id: In(ids) },
      { attackStatisticsUpdatedAt: sourceUpdatedAt },
    );
  }
}
