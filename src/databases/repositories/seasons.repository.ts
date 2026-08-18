import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { ISeason } from '../../interfaces/requests/seasons.interface';
import { ECompetitionType, EMatchStatus } from '../../shared/enums';
import { SeasonsEntity } from '../entities/seasons.entity';

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

  getWhere(
    where: FindOptionsWhere<SeasonsEntity>,
    manager?: EntityManager,
  ): Promise<SeasonsEntity[]> {
    const repository = manager?.getRepository(SeasonsEntity) ?? this.repository;

    return repository.find({ where });
  }

  findFinished(
    now: Date,
    competitionType: ECompetitionType,
  ): Promise<SeasonsEntity[]> {
    return this.repository
      .createQueryBuilder('season')
      .where(
        'EXISTS (SELECT 1 FROM competition_stages stage ' +
          'INNER JOIN championships championship ' +
          'ON championship.id = stage.championship_id ' +
          'WHERE stage.season_id = season.id ' +
          'AND championship.competition_type = :competitionType)',
        { competitionType },
      )
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM competition_stages stage ' +
          'INNER JOIN championships championship ' +
          'ON championship.id = stage.championship_id ' +
          'WHERE stage.season_id = season.id ' +
          'AND championship.competition_type = :competitionType ' +
          'AND stage.ends_at >= :now)',
        { now, competitionType },
      )
      .orderBy('season.name', 'DESC')
      .getMany();
  }

  findLatestWithActiveMatches(
    now: Date,
    competitionType: ECompetitionType,
  ): Promise<SeasonsEntity | null> {
    return this.repository
      .createQueryBuilder('season')
      .where(
        'EXISTS (SELECT 1 FROM competition_stages stage ' +
          'INNER JOIN championships championship ' +
          'ON championship.id = stage.championship_id ' +
          'INNER JOIN leagues league ON league.stage_id = stage.id ' +
          'INNER JOIN matches match ON match.league_id = league.id ' +
          'WHERE stage.season_id = season.id ' +
          'AND championship.competition_type = :competitionType ' +
          'AND stage.ends_at >= :now ' +
          'AND match.status = :scheduled)',
        {
          now,
          competitionType,
          scheduled: EMatchStatus.Scheduled,
        },
      )
      .orderBy('season.name', 'DESC')
      .getOne();
  }

  hasAny(): Promise<boolean> {
    return this.repository.exists();
  }

  upsertMany(
    seasons: Array<ISeason | Partial<SeasonsEntity>>,
    manager?: EntityManager,
  ) {
    const repository = manager?.getRepository(SeasonsEntity) ?? this.repository;

    return repository.upsert(seasons, {
      conflictPaths: ['name'],
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
      .where(
        "CAST(SPLIT_PART(name, '/', 1) AS integer) + " +
          "CASE WHEN POSITION('/' IN name) > 0 THEN 1 ELSE 0 END " +
          '< :beforeYear',
        { beforeYear },
      )
      .execute();

    return result.affected ?? 0;
  }
}
