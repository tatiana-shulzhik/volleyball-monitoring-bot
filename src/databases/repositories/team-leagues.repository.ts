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

  findByLeagueId(leagueId: number): Promise<TeamLeagueEntity[]> {
    return this.repository.find({
      select: { team: { id: true, name: true } },
      where: { league: { id: leagueId } },
      relations: { team: true },
      order: { team: { name: 'ASC' } },
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
