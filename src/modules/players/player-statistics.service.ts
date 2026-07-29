import { Injectable, Logger } from '@nestjs/common';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
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
    seasons: SeasonsEntity[],
  ): Promise<IPlayerStatisticsSynchronizationResult> {
    if (!seasons.length) {
      return { loadedRows: 0, synchronizedSeasonExternalIds: [] };
    }

    const externalIds = [
      ...new Set(seasons.map(({ externalId }) => externalId)),
    ];
    const [fetched, relations] = await Promise.all([
      this.gateway.fetchPlayerStatistics(seasons),
      this.relationsRepository.findBySeasonExternalIds(externalIds),
    ]);
    const relationsByPlayer = new Map(
      relations.map((relation) => [
        createPlayerRelationKey(
          relation.league.championship.season.externalId,
          relation.team.name,
          relation.player.fullName,
        ),
        relation,
      ]),
    );
    const sourceUpdatedAt = new Date();
    const rows: Partial<PlayerStatisticsEntity>[] = [];
    const synchronizedSeasonExternalIds: number[] = [];

    for (const result of fetched) {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Player statistics request failed: ${String(result.reason)}`,
        );
        continue;
      }

      synchronizedSeasonExternalIds.push(result.value.seasonExternalId);

      for (const item of result.value.statistics) {
        const relation = relationsByPlayer.get(
          createPlayerRelationKey(
            result.value.seasonExternalId,
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
          season: relation.league.championship.season,
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
      synchronizedSeasonExternalIds,
    };
  }
}
