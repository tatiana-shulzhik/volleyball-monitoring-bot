import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PlayerStatisticsEntity } from '../entities/player-statistics.entity';

@Injectable()
export class PlayerStatisticsRepository {
  constructor(
    @InjectRepository(PlayerStatisticsEntity)
    private readonly repository: Repository<PlayerStatisticsEntity>,
  ) {}

  findByPlayerIdsAndTeamIdAndSeasonId(
    playerIds: number[],
    teamId: number,
    seasonId: number,
  ): Promise<PlayerStatisticsEntity[]> {
    return this.repository.find({
      where: {
        player: { id: In(playerIds) },
        team: { id: teamId },
        season: { id: seasonId },
      },
      relations: { player: true },
    });
  }

  upsertMany(statistics: Partial<PlayerStatisticsEntity>[]): Promise<unknown> {
    if (!statistics.length) {
      return Promise.resolve();
    }

    return this.repository.upsert(statistics, {
      conflictPaths: ['player', 'team', 'season'],
      skipUpdateIfNoValuesChanged: true,
    });
  }
}
