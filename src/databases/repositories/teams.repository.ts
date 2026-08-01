import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
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

  getWhere(
    where: FindOptionsWhere<TeamEntity>,
    manager?: EntityManager,
  ): Promise<TeamEntity[]> {
    const repository = manager?.getRepository(TeamEntity) ?? this.repository;

    return repository.find({ where });
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

  async updateCountries(
    updates: Array<{ externalId: string; country: string }>,
  ): Promise<void> {
    await Promise.all(
      updates.map(({ externalId, country }) =>
        this.repository.update({ externalId }, { country }),
      ),
    );
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository = manager?.getRepository(TeamEntity) ?? this.repository;

    return repository.delete(ids);
  }

  async deleteOrphans(manager: EntityManager): Promise<number> {
    const deleted: Array<{ id: number }> = await manager.query(
      'DELETE FROM teams t WHERE NOT EXISTS ' +
        '(SELECT 1 FROM team_leagues tl WHERE tl.team_id = t.id) ' +
        'AND NOT EXISTS ' +
        '(SELECT 1 FROM player_team_leagues ptl WHERE ptl.team_id = t.id) ' +
        'AND NOT EXISTS ' +
        '(SELECT 1 FROM matches m WHERE m.home_team_id = t.id ' +
        'OR m.away_team_id = t.id) ' +
        'RETURNING t.id',
    );

    return deleted.length;
  }
}
