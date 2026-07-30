import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
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
    championships: ChampionshipsEntity[],
  ): Promise<IPlayerStatisticsSynchronizationResult> {
    if (!championships.length) {
      return { loadedRows: 0, synchronizedChampionshipExternalIds: [] };
    }

    const externalIds = [
      ...new Set(championships.map(({ externalId }) => externalId)),
    ];
    const [fetched, relations] = await Promise.all([
      this.gateway.fetchPlayerStatistics(championships),
      this.relationsRepository.getWhere({
        league: {
          stage: {
            championship: { externalId: In(externalIds) },
          },
        },
      }),
    ]);
    const relationsByPlayer = new Map(
      relations.map((relation) => [
        createPlayerRelationKey(
          relation.league.stage.championship.externalId,
          relation.team.name,
          relation.player.fullName,
        ),
        relation,
      ]),
    );
    const sourceUpdatedAt = new Date();
    const rows: Partial<PlayerStatisticsEntity>[] = [];
    const synchronizedChampionshipExternalIds: number[] = [];

    for (const result of fetched) {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Player statistics request failed: ${String(result.reason)}`,
        );
        continue;
      }

      synchronizedChampionshipExternalIds.push(
        result.value.championshipExternalId,
      );

      for (const item of result.value.statistics) {
        const relation = relationsByPlayer.get(
          createPlayerRelationKey(
            result.value.championshipExternalId,
            item.teamName,
            item.playerName,
          ),
        );

        if (!relation) {
          continue;
        }

        rows.push({
          player: relation.player,
          team: relation.team,
          championship: relation.league.stage.championship,
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
      synchronizedChampionshipExternalIds,
    };
  }
}
