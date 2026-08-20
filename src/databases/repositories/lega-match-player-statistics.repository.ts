import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { splitIntoBatches } from '../../shared/array.utils';
import { LegaMatchPlayerStatisticsEntity } from '../entities/lega-match-stats.entity';
import { IPlayerPointsAggregate } from '../../interfaces/responses/player-statistics.interface';
import { EMatchStatus } from '../../shared/enums';

@Injectable()
export class LegaMatchPlayerStatisticsRepository {
  constructor(
    @InjectRepository(LegaMatchPlayerStatisticsEntity)
    private readonly repository: Repository<LegaMatchPlayerStatisticsEntity>,
  ) {}

  async upsertMany(
    rows: Partial<LegaMatchPlayerStatisticsEntity>[],
    manager?: EntityManager,
  ): Promise<void> {
    const repository =
      manager?.getRepository(LegaMatchPlayerStatisticsEntity) ??
      this.repository;

    for (const batch of splitIntoBatches(rows)) {
      await repository.upsert(batch, {
        conflictPaths: ['match', 'player', 'team'],
        skipUpdateIfNoValuesChanged: true,
      });
    }
  }

  async aggregateByChampionshipIds(
    championshipIds: number[],
    playerIds: number[],
  ): Promise<IPlayerPointsAggregate[]> {
    if (!championshipIds.length || !playerIds.length) {
      return [];
    }

    const rows: Array<{
      championshipId: string;
      teamId: string;
      playerId: string;
      points: string | null;
    }> = await this.repository
      .createQueryBuilder('statistics')
      .innerJoin('statistics.match', 'match')
      .innerJoin('match.league', 'league')
      .innerJoin('league.stage', 'stage')
      .select([
        'stage.championship_id AS "championshipId"',
        'statistics.team_id AS "teamId"',
        'statistics.player_id AS "playerId"',
        'SUM(statistics.points) AS "points"',
      ])
      .where('stage.championship_id IN (:...championshipIds)', {
        championshipIds,
      })
      .andWhere('statistics.player_id IN (:...playerIds)', { playerIds })
      .andWhere('match.status = :status', {
        status: EMatchStatus.Finished,
      })
      .groupBy(
        'stage.championship_id, statistics.team_id, statistics.player_id',
      )
      .getRawMany();

    return rows.map((row) => ({
      championshipId: Number(row.championshipId),
      teamId: Number(row.teamId),
      playerId: Number(row.playerId),
      points: row.points === null ? null : Number(row.points),
    }));
  }
}
