import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { PlayerTeamSeasonEntity } from '../entities/player-team-season.entity';

@Injectable()
export class PlayerTeamSeasonsRepository {
  constructor(
    @InjectRepository(PlayerTeamSeasonEntity)
    private readonly repository: Repository<PlayerTeamSeasonEntity>,
  ) {}

  findByTeamIdsAndSeasonIds(
    teamIds: number[],
    seasonIds: number[],
  ): Promise<PlayerTeamSeasonEntity[]> {
    return this.repository.find({
      where: {
        team: { id: In(teamIds) },
        season: { id: In(seasonIds) },
      },
      relations: { player: true, team: true, season: true },
    });
  }

  insertMany(
    relations: Partial<PlayerTeamSeasonEntity>[],
    manager?: EntityManager,
  ) {
    const repository =
      manager?.getRepository(PlayerTeamSeasonEntity) ?? this.repository;

    return repository.insert(relations);
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository =
      manager?.getRepository(PlayerTeamSeasonEntity) ?? this.repository;

    return repository.delete(ids);
  }
}
