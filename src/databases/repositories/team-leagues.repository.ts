import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { TeamLeagueEntity } from '../entities/team-league.entity';

@Injectable()
export class TeamLeaguesRepository {
  constructor(
    @InjectRepository(TeamLeagueEntity)
    private readonly repository: Repository<TeamLeagueEntity>,
  ) {}

  getWhere(
    where: FindOptionsWhere<TeamLeagueEntity>,
    manager?: EntityManager,
  ): Promise<TeamLeagueEntity[]> {
    const repository =
      manager?.getRepository(TeamLeagueEntity) ?? this.repository;

    return repository.find({
      where,
      relations: { team: true, league: true },
    });
  }

  insertMany(relations: Partial<TeamLeagueEntity>[], manager?: EntityManager) {
    const repository =
      manager?.getRepository(TeamLeagueEntity) ?? this.repository;

    return repository.insert(relations);
  }

  updateMany(relations: Partial<TeamLeagueEntity>[], manager?: EntityManager) {
    const repository =
      manager?.getRepository(TeamLeagueEntity) ?? this.repository;

    return repository.upsert(relations, {
      conflictPaths: ['team', 'league'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository =
      manager?.getRepository(TeamLeagueEntity) ?? this.repository;

    return repository.delete(ids);
  }
}
