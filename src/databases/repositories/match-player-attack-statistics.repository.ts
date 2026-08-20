import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { splitIntoBatches } from '../../shared/array.utils';
import { EMatchStatus } from '../../shared/enums';
import {
  IPlayerAttackStatisticsAggregate,
  IPlayerAttackStatisticsAggregateRow,
} from '../../interfaces/responses/player-statistics.interface';
import { MatchPlayerAttackStatisticsEntity } from '../entities/match-player-attack-statistics.entity';
import { uniqueMatchPlayerAttackStatistics } from '../../shared/player-statistics.utils';

@Injectable()
export class MatchPlayerAttackStatisticsRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(MatchPlayerAttackStatisticsEntity)
    private readonly repository: Repository<MatchPlayerAttackStatisticsEntity>,
  ) {}

  useTransaction<T>(
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(action);
  }

  async replaceMany(
    matchIds: number[],
    rows: Partial<MatchPlayerAttackStatisticsEntity>[],
    manager: EntityManager,
  ): Promise<void> {
    const repository = manager.getRepository(MatchPlayerAttackStatisticsEntity);
    const uniqueRows = uniqueMatchPlayerAttackStatistics(rows);

    await repository.delete({ match: { id: In(matchIds) } });

    for (const batch of splitIntoBatches(uniqueRows)) {
      await repository.upsert(batch, {
        conflictPaths: ['match', 'player', 'team'],
        skipUpdateIfNoValuesChanged: true,
      });
    }
  }

  async aggregateByChampionshipIds(
    championshipIds: number[],
    playerIds: number[],
  ): Promise<IPlayerAttackStatisticsAggregate[]> {
    const query = this.repository
      .createQueryBuilder('attack')
      .innerJoin('attack.match', 'match')
      .innerJoin('match.league', 'league')
      .innerJoin('league.stage', 'stage')
      .select('stage.championship_id', 'championshipId')
      .addSelect('attack.team_id', 'teamId')
      .addSelect('attack.player_id', 'playerId')
      .addSelect('SUM(attack.attempts)', 'attempts')
      .addSelect('SUM(attack.successful)', 'successful')
      .addSelect(
        'CASE WHEN COUNT(*) FILTER (WHERE attack.points IS NULL OR ' +
          'attack.sets_played IS NULL) = 0 THEN SUM(attack.points) END',
        'points',
      )
      .addSelect(
        'CASE WHEN COUNT(*) FILTER (WHERE attack.points IS NULL OR ' +
          'attack.sets_played IS NULL) = 0 THEN SUM(attack.sets_played) END',
        'setsPlayed',
      )
      .where('stage.championship_id IN (:...championshipIds)', {
        championshipIds,
      })
      .andWhere('match.status = :finished', {
        finished: EMatchStatus.Finished,
      });

    query.andWhere('attack.player_id IN (:...playerIds)', { playerIds });

    const rows: IPlayerAttackStatisticsAggregateRow[] = await query
      .groupBy('stage.championship_id')
      .addGroupBy('attack.team_id')
      .addGroupBy('attack.player_id')
      .getRawMany();

    return rows.map((row) => ({
      championshipId: Number(row.championshipId),
      teamId: Number(row.teamId),
      playerId: Number(row.playerId),
      attempts: Number(row.attempts),
      successful: Number(row.successful),
      points: row.points === null ? null : Number(row.points),
      setsPlayed: row.setsPlayed === null ? null : Number(row.setsPlayed),
    }));
  }
}
