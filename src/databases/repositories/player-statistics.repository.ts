import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { splitIntoBatches } from '../../shared/array.utils';
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

  async upsertMany(
    statistics: Partial<PlayerStatisticsEntity>[],
  ): Promise<void> {
    for (const batch of splitIntoBatches(statistics)) {
      await this.repository.upsert(batch, {
        conflictPaths: ['player', 'team', 'season'],
        skipUpdateIfNoValuesChanged: true,
      });
    }
  }
}
