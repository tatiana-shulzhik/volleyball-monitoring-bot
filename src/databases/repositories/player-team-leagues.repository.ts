import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { splitIntoBatches } from '../../shared/array.utils';
import { ITeamLeaguePairsQuery } from '../../interfaces/requests/team-league-pairs-query.interface';
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
        league: { stage: { championship: { source: true }, season: true } },
      },
    });
  }

  getForTeamLeaguePairs(
    query: ITeamLeaguePairsQuery,
    manager?: EntityManager,
  ): Promise<PlayerTeamLeagueEntity[]> {
    const repository =
      manager?.getRepository(PlayerTeamLeagueEntity) ?? this.repository;

    return repository
      .createQueryBuilder('relation')
      .leftJoinAndSelect('relation.player', 'player')
      .leftJoinAndSelect('relation.team', 'team')
      .leftJoinAndSelect('relation.league', 'league')
      .leftJoinAndSelect('league.stage', 'stage')
      .leftJoinAndSelect('stage.championship', 'championship')
      .leftJoinAndSelect('championship.source', 'source')
      .leftJoinAndSelect('stage.season', 'season')
      .where(query.condition, query.parameters)
      .getMany();
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
