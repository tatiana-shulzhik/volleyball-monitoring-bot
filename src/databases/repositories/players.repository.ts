import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { PlayersEntity } from '../entities/players.entity';
import { SourcesEntity } from '../entities/sources.entity';
import { ESourceCode } from '../../shared/enums';

@Injectable()
export class PlayersRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(PlayersEntity)
    private readonly repository: Repository<PlayersEntity>,
  ) {}

  useTransaction<T>(
    manager: EntityManager | undefined,
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return manager ? action(manager) : this.dataSource.transaction(action);
  }

  getWhere(
    where: FindOptionsWhere<PlayersEntity>,
    manager?: EntityManager,
  ): Promise<PlayersEntity[]> {
    const repository = manager?.getRepository(PlayersEntity) ?? this.repository;

    return repository.find({ where });
  }

  async insertMany(players: Partial<PlayersEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(PlayersEntity) ?? this.repository;
    const source = await (
      manager?.getRepository(SourcesEntity) ??
      this.repository.manager.getRepository(SourcesEntity)
    ).findOneByOrFail({ code: ESourceCode.Cev });

    return repository.insert(players.map((player) => ({ ...player, source })));
  }

  async updateMany(
    players: Partial<PlayersEntity>[],
    manager?: EntityManager,
    sourceCode = ESourceCode.Cev,
  ) {
    const repository = manager?.getRepository(PlayersEntity) ?? this.repository;
    const source = await (
      manager?.getRepository(SourcesEntity) ??
      this.repository.manager.getRepository(SourcesEntity)
    ).findOneByOrFail({ code: sourceCode });
    const values = players.map(({ externalId, fullName, birthYear }) => ({
      externalId,
      fullName,
      birthYear,
      source,
    }));

    return repository.upsert(values, {
      conflictPaths: ['externalId'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository = manager?.getRepository(PlayersEntity) ?? this.repository;

    return repository.delete(ids);
  }

  async deleteOrphans(manager: EntityManager): Promise<number> {
    const deleted: Array<{ id: number }> = await manager.query(
      'DELETE FROM players p WHERE NOT EXISTS ' +
        '(SELECT 1 FROM player_team_leagues ptl WHERE ptl.player_id = p.id) ' +
        'RETURNING p.id',
    );

    return deleted.length;
  }
}
