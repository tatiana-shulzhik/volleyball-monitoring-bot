import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';
import { PlayerStatisticsRepository } from '../../databases/repositories/player-statistics.repository';
import { MatchesRepository } from '../../databases/repositories/matches.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { PlayerStatisticsEntity } from '../../databases/entities/player-statistics.entity';
import { IPlayerStatisticsSynchronizationResult } from '../../interfaces/responses/player-statistics.interface';
import { createCompetitionStageKey } from '../../shared/competition-stages.utils';
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
    private readonly matchesRepository: MatchesRepository,
  ) {}

  async synchronize(
    stages: CompetitionStagesEntity[],
  ): Promise<IPlayerStatisticsSynchronizationResult> {
    if (!stages.length) {
      return { loadedRows: 0, synchronizedStageExternalIds: [] };
    }

    const [fetched, relations, matches] = await Promise.all([
      this.gateway.fetchPlayerStatistics(stages),
      this.relationsRepository.getWhere({
        league: { stage: { id: In(stages.map(({ id }) => id)) } },
      }),
      this.matchesRepository.findFinishedByStageIds(stages.map(({ id }) => id)),
    ]);
    const fetchedAttacks =
      await this.gateway.fetchMatchAttackStatistics(matches);
    const existingStatistics = await this.statisticsRepository.getWhere({
      stage: { id: In(stages.map(({ id }) => id)) },
    });
    const existingStatisticsByKey = new Map(
      existingStatistics.map((item) => [
        `${item.stage.id}:${item.team.id}:${item.player.id}`,
        item,
      ]),
    );
    const incompleteAttackStageIds = new Set<number>();
    const stagesByExternalKey = new Map(
      stages.map((stage) => [
        createCompetitionStageKey(
          stage.championship.externalId,
          stage.externalId,
        ),
        stage,
      ]),
    );
    const relationsByPlayer = new Map(
      relations.map((relation) => [
        createPlayerRelationKey(
          createCompetitionStageKey(
            relation.league.stage.championship.externalId,
            relation.league.stage.externalId,
          ),
          relation.team.name,
          relation.player.fullName,
        ),
        relation,
      ]),
    );
    const sourceUpdatedAt = new Date();
    const attacksByRelationKey = new Map<
      string,
      { attempts: number; successful: number }
    >();

    for (const [index, result] of fetchedAttacks.entries()) {
      if (result.status === 'rejected') {
        const failedMatch = matches[index];

        if (failedMatch) {
          incompleteAttackStageIds.add(failedMatch.league.stage.id);
        }
        this.logger.warn(
          `Match attack statistics request failed: ${String(result.reason)}`,
        );
        continue;
      }

      const match = matches.find(
        ({ externalId }) => externalId === result.value.matchExternalId,
      );

      if (!match) {
        continue;
      }

      if (!result.value.home.length && !result.value.away.length) {
        incompleteAttackStageIds.add(match.league.stage.id);
        this.logger.warn(
          `Match attack statistics are empty: ${match.externalId}`,
        );
        continue;
      }

      const sourceKey = createCompetitionStageKey(
        match.league.stage.championship.externalId,
        match.league.stage.externalId,
      );

      for (const [team, players] of [
        [match.homeTeam, result.value.home],
        [match.awayTeam, result.value.away],
      ] as const) {
        for (const player of players) {
          const key = createPlayerRelationKey(
            sourceKey,
            team.name,
            player.playerName,
          );
          const stored = attacksByRelationKey.get(key) ?? {
            attempts: 0,
            successful: 0,
          };

          stored.attempts += player.attempts;
          stored.successful += player.successful;
          attacksByRelationKey.set(key, stored);
        }
      }
    }
    const rows: Partial<PlayerStatisticsEntity>[] = [];
    const synchronizedRelationKeys = new Set<string>();
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
        const relationKey = createPlayerRelationKey(
          sourceKey,
          item.teamName,
          item.playerName,
        );
        const relation = relationsByPlayer.get(relationKey);

        if (!relation) {
          continue;
        }

        const attacks = attacksByRelationKey.get(relationKey);
        const existing = existingStatisticsByKey.get(
          `${stage.id}:${relation.team.id}:${relation.player.id}`,
        );
        const preserveStoredAttacks = incompleteAttackStageIds.has(stage.id);

        synchronizedRelationKeys.add(relationKey);
        rows.push({
          player: relation.player,
          team: relation.team,
          stage,
          matchesPlayed: item.matchesPlayed,
          points: item.points,
          setsPlayed: item.setsPlayed,
          attackAttempts: preserveStoredAttacks
            ? (existing?.attackAttempts ?? 0)
            : (attacks?.attempts ?? 0),
          successfulAttacks: preserveStoredAttacks
            ? (existing?.successfulAttacks ?? 0)
            : (attacks?.successful ?? 0),
          sourceUpdatedAt,
        });
      }
    }

    for (const [relationKey, attacks] of attacksByRelationKey) {
      if (synchronizedRelationKeys.has(relationKey)) {
        continue;
      }

      const relation = relationsByPlayer.get(relationKey);

      if (!relation) {
        continue;
      }

      rows.push({
        player: relation.player,
        team: relation.team,
        stage: relation.league.stage,
        matchesPlayed: 0,
        points: 0,
        setsPlayed: 0,
        attackAttempts: attacks.attempts,
        successfulAttacks: attacks.successful,
        sourceUpdatedAt,
      });
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
