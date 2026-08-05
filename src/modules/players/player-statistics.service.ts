import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';
import { PlayerStatisticsRepository } from '../../databases/repositories/player-statistics.repository';
import { MatchesRepository } from '../../databases/repositories/matches.repository';
import { MatchPlayerAttackStatisticsRepository } from '../../databases/repositories/match-player-attack-statistics.repository';
import { MatchPlayerAttackStatisticsEntity } from '../../databases/entities/match-player-attack-statistics.entity';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { CevGateway } from '../../gateway/cev.gateway';
import { PlayerStatisticsEntity } from '../../databases/entities/player-statistics.entity';
import { IPlayerStatisticsSynchronizationResult } from '../../interfaces/responses/player-statistics.interface';
import { createCompetitionStageKey } from '../../shared/competition-stages.utils';
import {
  normalizePlayerName,
  uniquePlayerStatistics,
  buildRelationMaps,
  findPlayerRelation,
  getMatchTeams,
} from '../../shared/player-statistics.utils';

@Injectable()
export class PlayerStatisticsService {
  private readonly logger = new Logger(PlayerStatisticsService.name);

  constructor(
    private readonly gateway: CevGateway,
    private readonly playersRepository: PlayersRepository,
    private readonly relationsRepository: PlayerTeamLeaguesRepository,
    private readonly statisticsRepository: PlayerStatisticsRepository,
    private readonly matchesRepository: MatchesRepository,
    private readonly matchAttacksRepository: MatchPlayerAttackStatisticsRepository,
    private readonly cache: RedisCacheService,
  ) {}

  findPendingAttackStageIds(): Promise<number[]> {
    return this.matchesRepository.findStageIdsRequiringAttackStatistics();
  }

  async synchronize(
    stages: CompetitionStagesEntity[],
  ): Promise<IPlayerStatisticsSynchronizationResult> {
    if (!stages.length) {
      return { loadedRows: 0, synchronizedStageExternalIds: [] };
    }

    await this.loadPendingAttacks(stages);
    return this.synchronizePlayerRankings(stages);
  }

  async synchronizePendingAttacks(
    stages: CompetitionStagesEntity[],
  ): Promise<number> {
    const loadedMatches = await this.loadPendingAttacks(stages);

    if (loadedMatches) {
      await this.cache.deleteByPattern('team-statistics:*');
    }

    return loadedMatches;
  }

  private async loadPendingAttacks(
    stages: CompetitionStagesEntity[],
  ): Promise<number> {
    if (!stages.length) {
      return 0;
    }

    const stageIds = stages.map(({ id }) => id);
    const matches =
      await this.matchesRepository.findFinishedRequiringAttackStatistics(
        stageIds,
      );

    if (!matches.length) {
      return 0;
    }

    const [relations, fetchedAttacks] = await Promise.all([
      this.relationsRepository.getWhere({
        league: { stage: { id: In(stageIds) } },
      }),
      this.gateway.fetchMatchAttackStatistics(matches),
    ]);
    let relationMaps = buildRelationMaps(relations);
    const sourceUpdatedAt = new Date();
    const matchesByExternalId = new Map(
      matches.map((match) => [match.externalId, match]),
    );
    const attackRows: Partial<MatchPlayerAttackStatisticsEntity>[] = [];
    const loadedMatchIds: number[] = [];

    const protocolPlayers = new Map<
      string,
      {
        externalId: string;
        fullName: string;
        team: (typeof matches)[number]['homeTeam'];
        league: (typeof matches)[number]['league'];
      }
    >();
    for (const result of fetchedAttacks) {
      if (result.status === 'rejected') {
        continue;
      }

      const match = matchesByExternalId.get(result.value.matchExternalId);
      if (!match) {
        continue;
      }

      const sourceKey = createCompetitionStageKey(
        match.league.stage.championship.externalId,
        match.league.stage.externalId,
      );
      for (const { team, players } of getMatchTeams(match, result.value)) {
        for (const player of players) {
          const found = findPlayerRelation(
            relationMaps,
            sourceKey,
            team.name,
            player.playerName,
          );
          if (found.relation) {
            continue;
          }

          const externalId = `protocol:${team.externalId}:${normalizePlayerName(player.playerName)}`;
          protocolPlayers.set(externalId, {
            externalId,
            fullName: player.playerName,
            team,
            league: match.league,
          });
        }
      }
    }

    if (protocolPlayers.size) {
      const externalIds = [...protocolPlayers.keys()];
      const existingPlayers = await this.playersRepository.getWhere({
        externalId: In(externalIds),
      });
      const existingIds = new Set(
        existingPlayers.map(({ externalId }) => externalId),
      );
      const missingPlayers = [...protocolPlayers.values()]
        .filter(({ externalId }) => !existingIds.has(externalId))
        .map(({ externalId, fullName }) => ({
          externalId,
          fullName,
          birthYear: null,
        }));

      if (missingPlayers.length) {
        await this.playersRepository.insertMany(missingPlayers);
      }

      const storedPlayers = await this.playersRepository.getWhere({
        externalId: In(externalIds),
      });
      await this.relationsRepository.updateMany(
        storedPlayers.map((player) => {
          const candidate = protocolPlayers.get(player.externalId)!;
          return {
            player,
            team: candidate.team,
            league: candidate.league,
            shirtNumber: null,
            position: null,
          };
        }),
      );
      relationMaps = buildRelationMaps(
        await this.relationsRepository.getWhere({
          league: { stage: { id: In(stageIds) } },
        }),
      );
      this.logger.log(
        `${protocolPlayers.size} players imported from match protocols`,
      );
    }

    for (const [index, result] of fetchedAttacks.entries()) {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Match attack statistics request failed for ` +
            `${matches[index]?.externalId ?? 'unknown'}: ${String(result.reason)}`,
        );
        continue;
      }

      const match = matchesByExternalId.get(result.value.matchExternalId);

      if (!match) {
        continue;
      }

      if (!result.value.home.length && !result.value.away.length) {
        this.logger.warn(
          `Match attack statistics are empty: ${match.externalId}`,
        );
        continue;
      }

      const sourceKey = createCompetitionStageKey(
        match.league.stage.championship.externalId,
        match.league.stage.externalId,
      );
      const currentRows: Partial<MatchPlayerAttackStatisticsEntity>[] = [];
      const unresolvedPlayerNames: string[] = [];

      for (const { team, players } of getMatchTeams(match, result.value)) {
        for (const player of players) {
          const { relation } = findPlayerRelation(
            relationMaps,
            sourceKey,
            team.name,
            player.playerName,
          );

          if (!relation) {
            if (player.attempts > 0 || player.successful > 0) {
              unresolvedPlayerNames.push(player.playerName);
            }
            continue;
          }

          currentRows.push({
            match,
            player: relation.player,
            team: relation.team,
            attempts: player.attempts,
            successful: player.successful,
            sourceUpdatedAt,
          });
        }
      }

      if (unresolvedPlayerNames.length) {
        const examples = unresolvedPlayerNames.slice(0, 3).join(', ');

        this.logger.warn(
          `Match attack statistics partially loaded for ${match.externalId}: ` +
            `${unresolvedPlayerNames.length} players not found; ` +
            `matched players are kept` +
            `${examples ? ` (${examples})` : ''}`,
        );
      }

      attackRows.push(...currentRows);
      loadedMatchIds.push(match.id);
    }

    if (loadedMatchIds.length) {
      await this.matchAttacksRepository.useTransaction(async (manager) => {
        await this.matchAttacksRepository.replaceMany(
          loadedMatchIds,
          attackRows,
          manager,
        );
        await this.matchesRepository.markAttackStatisticsLoaded(
          loadedMatchIds,
          sourceUpdatedAt,
          manager,
        );
      });
      this.logger.log(
        `${loadedMatchIds.length} match attack statistics loaded`,
      );
    }

    return loadedMatchIds.length;
  }

  private async synchronizePlayerRankings(
    stages: CompetitionStagesEntity[],
  ): Promise<IPlayerStatisticsSynchronizationResult> {
    const stageIds = stages.map(({ id }) => id);
    const [fetched, relations] = await Promise.all([
      this.gateway.fetchPlayerStatistics(stages),
      this.relationsRepository.getWhere({
        league: { stage: { id: In(stageIds) } },
      }),
    ]);
    const stagesByExternalKey = new Map(
      stages.map((stage) => [
        createCompetitionStageKey(
          stage.championship.externalId,
          stage.externalId,
        ),
        stage,
      ]),
    );
    const relationMaps = buildRelationMaps(relations);
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
      const sourceKey = createCompetitionStageKey(
        result.value.championshipExternalId,
        result.value.stageExternalId,
      );
      const stage = stagesByExternalKey.get(sourceKey);

      if (!stage) {
        continue;
      }

      for (const item of result.value.statistics) {
        const { relation, isExact } = findPlayerRelation(
          relationMaps,
          sourceKey,
          item.teamName,
          item.playerName,
        );

        if (!relation) {
          continue;
        }

        if (!isExact) {
          this.logger.warn(
            `Player statistics team name mismatch: "${item.teamName}" -> ` +
              `"${relation.team.name}" for "${item.playerName}"`,
          );
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
    await this.cache.deleteByPattern('team-statistics:*');
    this.logger.log(`${unique.length} player statistics rows loaded`);
    return {
      loadedRows: unique.length,
      synchronizedStageExternalIds,
    };
  }
}
