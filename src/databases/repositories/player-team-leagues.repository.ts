import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { splitIntoBatches } from '../../shared/array.utils';
import { PlayerTeamLeagueEntity } from '../entities/player-team-league.entity';

@Injectable()
export class PlayerTeamLeaguesRepository {
  constructor(
    @InjectRepository(PlayerTeamLeagueEntity)
    private readonly repository: Repository<PlayerTeamLeagueEntity>,
  ) {}

  findByTeamIdsAndLeagueIds(
    teamIds: number[],
    leagueIds: number[],
  ): Promise<PlayerTeamLeagueEntity[]> {
    return this.repository.find({
      where: {
        team: { id: In(teamIds) },
        league: { id: In(leagueIds) },
      },
      relations: { player: true, team: true, league: true },
    });
  }

  findByChampionshipExternalIds(
    championshipExternalIds: number[],
  ): Promise<PlayerTeamLeagueEntity[]> {
    return this.repository.find({
      where: {
        league: {
          stage: {
            championship: { externalId: In(championshipExternalIds) },
          },
        },
      },
      relations: {
        player: true,
        team: true,
        league: { stage: { championship: { season: true } } },
      },
    });
  }

  findByTeamIdAndLeagueId(
    teamId: number,
    leagueId: number,
  ): Promise<PlayerTeamLeagueEntity[]> {
    return this.repository.find({
      where: { team: { id: teamId }, league: { id: leagueId } },
      relations: {
        player: true,
        team: true,
        league: { stage: { championship: { season: true } } },
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
