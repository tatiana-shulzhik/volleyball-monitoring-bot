import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';
import { PlayerStatisticsRepository } from '../../databases/repositories/player-statistics.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { PlayerStatisticsEntity } from '../../databases/entities/player-statistics.entity';
import { IPlayerStatisticsSynchronizationResult } from '../../interfaces/responses/player-statistics.interface';
import {
  createPlayerRelationKey,
  uniquePlayerStatistics,
} from '../../shared/player-statistics.utils';

@Injectable()
export class PlayerStatisticsService {
  private readonly logger = new Logger(PlayerStatisticsService.name);

  constructor(
    private readonly gateway: CevGateway,
    private readonly relationsRepository: PlayerTeamLeaguesRepository,
    private readonly statisticsRepository: PlayerStatisticsRepository,
  ) {}

  async synchronize(
    stages: CompetitionStagesEntity[],
  ): Promise<IPlayerStatisticsSynchronizationResult> {
    if (!stages.length) {
      return { loadedRows: 0, synchronizedStageExternalIds: [] };
    }

    const [fetched, relations] = await Promise.all([
      this.gateway.fetchPlayerStatistics(stages),
      this.relationsRepository.getWhere({
        league: { stage: { id: In(stages.map(({ id }) => id)) } },
      }),
    ]);
    const stagesByExternalKey = new Map(
      stages.map((stage) => [
        `${stage.championship.externalId}:${stage.externalId}`,
        stage,
      ]),
    );
    const relationsByPlayer = new Map(
      relations.map((relation) => [
        createPlayerRelationKey(
          `${relation.league.stage.championship.externalId}:` +
            relation.league.stage.externalId,
          relation.team.name,
          relation.player.fullName,
        ),
        relation,
      ]),
    );
    const sourceUpdatedAt = new Date();
    const rows: Partial<PlayerStatisticsEntity>[] = [];
    const synchronizedStageExternalIds: number[] = [];

    for (const result of fetched) {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Player statistics request failed: ${String(result.reason)}`,
        );
        continue;
      }

      synchronizedStageExternalIds.push(result.value.stageExternalId);
      const sourceKey =
        `${result.value.championshipExternalId}:` +
        result.value.stageExternalId;
      const stage = stagesByExternalKey.get(sourceKey);

      if (!stage) {
        continue;
      }

      for (const item of result.value.statistics) {
        const relation = relationsByPlayer.get(
          createPlayerRelationKey(sourceKey, item.teamName, item.playerName),
        );

        if (!relation) {
          continue;
        }

        rows.push({
          player: relation.player,
          team: relation.team,
          stage,
          matchesPlayed: item.matchesPlayed,
          points: item.points,
          setsPlayed: item.setsPlayed,
          sourceUpdatedAt,
        });
      }
    }

    const unique = uniquePlayerStatistics(rows);
    await this.statisticsRepository.upsertMany(unique);
    this.logger.log(`${unique.length} player statistics rows loaded`);
    return {
      loadedRows: unique.length,
      synchronizedStageExternalIds,
    };
  }
}
