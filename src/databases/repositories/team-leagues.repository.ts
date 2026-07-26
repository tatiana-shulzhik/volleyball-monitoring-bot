import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { TeamLeagueEntity } from '../entities/team-league.entity';

@Injectable()
export class TeamLeaguesRepository {
  constructor(
    @InjectRepository(TeamLeagueEntity)
    private readonly repository: Repository<TeamLeagueEntity>,
  ) {}

  findByLeagueIds(leagueIds: number[]): Promise<TeamLeagueEntity[]> {
    return this.repository.find({
      where: { league: { id: In(leagueIds) } },
      relations: { team: true, league: true },
    });
  }

  insertMany(relations: Partial<TeamLeagueEntity>[], manager?: EntityManager) {
    const repository =
      manager?.getRepository(TeamLeagueEntity) ?? this.repository;

    return repository.insert(relations);
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository =
      manager?.getRepository(TeamLeagueEntity) ?? this.repository;

    return repository.delete(ids);
  }
}
