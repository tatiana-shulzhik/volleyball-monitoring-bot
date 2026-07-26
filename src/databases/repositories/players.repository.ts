import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { PlayersEntity } from '../entities/players.entity';

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

  findByExternalIds(externalIds: string[]): Promise<PlayersEntity[]> {
    return this.repository.find({
      where: { externalId: In(externalIds) },
    });
  }

  insertMany(players: Partial<PlayersEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(PlayersEntity) ?? this.repository;

    return repository.insert(players);
  }

  updateMany(players: PlayersEntity[], manager?: EntityManager) {
    const repository = manager?.getRepository(PlayersEntity) ?? this.repository;
    const values = players.map(({ externalId, fullName, position }) => ({
      externalId,
      fullName,
      position,
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
        '(SELECT 1 FROM player_team_seasons pts WHERE pts.player_id = p.id) ' +
        'RETURNING p.id',
    );

    return deleted.length;
  }
}
