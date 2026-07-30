import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { splitIntoBatches } from '../../shared/array.utils';
import { PlayerTeamLeagueEntity } from '../entities/player-team-league.entity';

@Injectable()
export class PlayerTeamLeaguesRepository {
  constructor(
    @InjectRepository(PlayerTeamLeagueEntity)
    private readonly repository: Repository<PlayerTeamLeagueEntity>,
  ) {}

  getWhere(
    where: FindOptionsWhere<PlayerTeamLeagueEntity>,
    manager?: EntityManager,
  ): Promise<PlayerTeamLeagueEntity[]> {
    const repository =
      manager?.getRepository(PlayerTeamLeagueEntity) ?? this.repository;

    return repository.find({
      where,
      relations: {
        player: true,
        team: true,
        league: { stage: { championship: true, season: true } },
      },
    });
  }

  async insertMany(
    relations: Partial<PlayerTeamLeagueEntity>[],
    manager?: EntityManager,
  ) {
    const repository =
      manager?.getRepository(PlayerTeamLeagueEntity) ?? this.repository;

    for (const batch of splitIntoBatches(relations)) {
      await repository.insert(batch);
    }
  }

  async updateMany(
    relations: Partial<PlayerTeamLeagueEntity>[],
    manager?: EntityManager,
  ) {
    const repository =
      manager?.getRepository(PlayerTeamLeagueEntity) ?? this.repository;

    for (const batch of splitIntoBatches(relations)) {
      await repository.upsert(batch, {
        conflictPaths: ['player', 'team', 'league'],
        skipUpdateIfNoValuesChanged: true,
      });
    }
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository =
      manager?.getRepository(PlayerTeamLeagueEntity) ?? this.repository;

    return repository.delete(ids);
  }
}
