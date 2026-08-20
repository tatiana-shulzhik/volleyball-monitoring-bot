import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { PlayersRepository } from '../../databases/repositories/players.repository';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';
import { MatchesRepository } from '../../databases/repositories/matches.repository';
import { LegaMatchPlayerStatisticsRepository } from '../../databases/repositories/lega-match-player-statistics.repository';
import { MatchPlayerAttackStatisticsRepository } from '../../databases/repositories/match-player-attack-statistics.repository';
import { MatchPlayerAttackStatisticsEntity } from '../../databases/entities/match-player-attack-statistics.entity';
import { MatchEntity } from '../../databases/entities/match.entity';
import { PlayerTeamLeagueEntity } from '../../databases/entities/player-team-league.entity';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { IFetchedMatchRoster } from '../../interfaces/requests/player-statistics.interface';
import { IFetchedMatchAttackStatistics } from '../../interfaces/requests/player-statistics.interface';
import { ILegaMatchStatistics } from '../../interfaces/requests/lega-volley.interface';
import { createCompetitionStageKey } from '../../shared/competition-stages.utils';
import {
  buildRelationMaps,
  findPlayerRelation,
  getMatchTeams,
  createPlayerTeamLeagueKey,
} from '../../shared/player-statistics.utils';
import { createLegaMatchLookupKey } from '../../shared/lega-volley.utils';
import { ESourceCode } from '../../shared/enums';

@Injectable()
export class PlayerStatisticsService {
  private readonly logger = new Logger(PlayerStatisticsService.name);

  constructor(
    private readonly playersRepository: PlayersRepository,
    private readonly relationsRepository: PlayerTeamLeaguesRepository,
    private readonly matchesRepository: MatchesRepository,
    private readonly matchAttacksRepository: MatchPlayerAttackStatisticsRepository,
    private readonly legaMatchStatisticsRepository: LegaMatchPlayerStatisticsRepository,
    private readonly cache: RedisCacheService,
  ) {}

  async upsertLegaMatchStatistics(
    statistics: ILegaMatchStatistics[],
  ): Promise<number> {
    const [players, matches] = await Promise.all([
      this.playersRepository.getWhere({
        source: { code: ESourceCode.LegaVolley },
      }),
      this.matchesRepository.getWhere({
        league: {
          stage: { championship: { source: { code: ESourceCode.LegaVolley } } },
        },
      }),
    ]);
    const playersByExternalId = new Map(
      players.map((player) => [player.externalId, player]),
    );
    const matchesByKey = new Map(
      matches.map((match) => [
        createLegaMatchLookupKey(
          match.league.externalId,
          match.homeTeam.name,
          match.awayTeam.name,
          match.scheduledAt,
        ),
        match,
      ]),
    );
    const sourceUpdatedAt = new Date();
    const rows: Parameters<
      LegaMatchPlayerStatisticsRepository['upsertMany']
    >[0] = [];
    const loadedMatchIds = new Set<number>();
    const externalIdsByMatchId = new Map<number, string>();

    for (const item of statistics) {
      const match = matchesByKey.get(
        createLegaMatchLookupKey(
          item.leagueExternalId,
          item.homeTeamName,
          item.awayTeamName,
          item.playedOn,
        ),
      );
      if (!match) continue;
      externalIdsByMatchId.set(match.id, item.sourceMatchId);

      for (const [team, playersStatistics] of [
        [match.homeTeam, item.home],
        [match.awayTeam, item.away],
      ] as const) {
        for (const statistic of playersStatistics) {
          const player = playersByExternalId.get(statistic.externalId);
          if (!player) continue;

          rows.push({
            match,
            team,
            player,
            points: statistic.points,
            shirtNumber: statistic.shirtNumber,
            played: statistic.played,
            sourceUpdatedAt,
          });
          loadedMatchIds.add(match.id);
        }
      }
    }
    await this.matchesRepository.updateExternalIds(
      [...externalIdsByMatchId].map(([id, externalId]) => ({ id, externalId })),
    );
    if (rows.length) {
      await this.legaMatchStatisticsRepository.upsertMany(rows);
      await this.matchesRepository.markAttackStatisticsLoaded(
        [...loadedMatchIds],
        sourceUpdatedAt,
      );
    }

    return rows.length;
  }

  findPendingLegaMatches(): Promise<MatchEntity[]> {
    return this.matchesRepository.findFinishedRequiringLegaStatistics();
  }

  findPendingAttackStageIds(): Promise<number[]> {
    return this.matchesRepository.findStageIdsRequiringAttackStatistics();
  }

  async findPendingMatches(
    stages: CompetitionStagesEntity[],
  ): Promise<MatchEntity[]> {
    if (!stages.length) {
      return [];
    }

    return this.matchesRepository.findFinishedRequiringAttackStatistics(
      stages.map(({ id }) => id),
    );
  }

  async findMatchesRequiringRosters(
    matches: MatchEntity[],
    fetchedAttacks: PromiseSettledResult<IFetchedMatchAttackStatistics>[],
  ): Promise<MatchEntity[]> {
    const stageIds = [...new Set(matches.map(({ league }) => league.stage.id))];
    const storedRelations = await this.relationsRepository.getWhere({
      league: { stage: { id: In(stageIds) } },
    });
    return this.findRosterMatches(matches, fetchedAttacks, storedRelations);
  }

  async synchronizeFetchedAttacks(
    stages: CompetitionStagesEntity[],
    matches: MatchEntity[],
    fetchedAttacks: PromiseSettledResult<IFetchedMatchAttackStatistics>[],
    fetchedRosters: PromiseSettledResult<IFetchedMatchRoster>[],
  ): Promise<number> {
    const loadedMatches = await this.loadPendingAttacks(
      stages,
      matches,
      fetchedAttacks,
      fetchedRosters,
    );

    if (loadedMatches) {
      await this.cache.deleteByPattern('team-statistics:*');
    }

    return loadedMatches;
  }

  private async loadPendingAttacks(
    stages: CompetitionStagesEntity[],
    matches: MatchEntity[],
    fetchedAttacks: PromiseSettledResult<IFetchedMatchAttackStatistics>[],
    fetchedRosters: PromiseSettledResult<IFetchedMatchRoster>[],
  ): Promise<number> {
    if (!stages.length) {
      return 0;
    }

    const stageIds = stages.map(({ id }) => id);
    if (!matches.length) {
      return 0;
    }

    const storedRelations = await this.relationsRepository.getWhere({
      league: { stage: { id: In(stageIds) } },
    });
    const matchesByExternalId = new Map(
      matches.map((match) => [match.externalId, match]),
    );
    let relationMaps = buildRelationMaps(storedRelations);
    const rosterMatches = this.findRosterMatches(
      matches,
      fetchedAttacks,
      storedRelations,
    );

    if (rosterMatches.length) {
      const relations = await this.synchronizeMatchRosterRelations(
        stageIds,
        rosterMatches,
        fetchedRosters,
        storedRelations,
      );
      relationMaps = buildRelationMaps(relations);
    }

    const sourceUpdatedAt = new Date();
    const attackRows: Partial<MatchPlayerAttackStatisticsEntity>[] = [];
    const replacedMatchIds: number[] = [];
    const completedMatchIds: number[] = [];

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
          const relation = findPlayerRelation(
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
            points: player.points,
            setsPlayed: player.setsPlayed,
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
      replacedMatchIds.push(match.id);

      if (!unresolvedPlayerNames.length) {
        completedMatchIds.push(match.id);
      }
    }

    if (replacedMatchIds.length) {
      await this.matchAttacksRepository.useTransaction(async (manager) => {
        await this.matchAttacksRepository.replaceMany(
          replacedMatchIds,
          attackRows,
          manager,
        );

        if (completedMatchIds.length) {
          await this.matchesRepository.markAttackStatisticsLoaded(
            completedMatchIds,
            sourceUpdatedAt,
            manager,
          );
        }
      });
      this.logger.log(
        `${replacedMatchIds.length} match attack statistics loaded, ` +
          `${completedMatchIds.length} completed`,
      );
    }

    return replacedMatchIds.length;
  }

  private findRosterMatches(
    matches: MatchEntity[],
    fetchedAttacks: PromiseSettledResult<IFetchedMatchAttackStatistics>[],
    relations: PlayerTeamLeagueEntity[],
  ): MatchEntity[] {
    const matchesByExternalId = new Map(
      matches.map((match) => [match.externalId, match]),
    );
    const relationMaps = buildRelationMaps(relations);

    return fetchedAttacks.flatMap((result) => {
      if (result.status === 'rejected') return [];

      const match = matchesByExternalId.get(result.value.matchExternalId);
      if (!match) return [];

      const sourceKey = createCompetitionStageKey(
        match.league.stage.championship.externalId,
        match.league.stage.externalId,
      );
      const hasUnresolvedPlayers = getMatchTeams(match, result.value).some(
        ({ team, players }) =>
          players.some(
            (player) =>
              !findPlayerRelation(
                relationMaps,
                sourceKey,
                team.name,
                player.playerName,
              ),
          ),
      );

      return hasUnresolvedPlayers ? [match] : [];
    });
  }

  private async synchronizeMatchRosterRelations(
    stageIds: number[],
    matches: MatchEntity[],
    fetched: PromiseSettledResult<IFetchedMatchRoster>[],
    existingRelations: PlayerTeamLeagueEntity[],
  ): Promise<PlayerTeamLeagueEntity[]> {
    const matchesByExternalId = new Map(
      matches.map((match) => [match.externalId, match]),
    );
    const rosterEntries = fetched.flatMap((result) => {
      if (result.status === 'rejected') {
        return [];
      }

      const match = matchesByExternalId.get(result.value.matchExternalId);

      if (!match) {
        return [];
      }

      return [
        ...result.value.home.map((player) => ({
          player,
          team: match.homeTeam,
          league: match.league,
        })),
        ...result.value.away.map((player) => ({
          player,
          team: match.awayTeam,
          league: match.league,
        })),
      ];
    });

    if (!rosterEntries.length) {
      return existingRelations;
    }

    const externalIds = [
      ...new Set(rosterEntries.map(({ player }) => player.externalId)),
    ];
    const playersByExternalId = new Map(
      (
        await this.playersRepository.getWhere({ externalId: In(externalIds) })
      ).map((player) => [player.externalId, player]),
    );
    const missingPlayers = [
      ...new Map(
        rosterEntries
          .filter(({ player }) => !playersByExternalId.has(player.externalId))
          .map(({ player }) => [
            player.externalId,
            {
              externalId: player.externalId,
              fullName: player.playerName,
              birthYear: null,
            },
          ]),
      ).values(),
    ];

    if (missingPlayers.length) {
      await this.playersRepository.insertMany(missingPlayers);

      for (const player of await this.playersRepository.getWhere({
        externalId: In(missingPlayers.map(({ externalId }) => externalId)),
      })) {
        playersByExternalId.set(player.externalId, player);
      }
    }

    const existingByKey = new Map(
      existingRelations.map((relation) => [
        createPlayerTeamLeagueKey(
          relation.player.id,
          relation.team.id,
          relation.league.id,
        ),
        relation,
      ]),
    );
    const relationRows = [
      ...new Map(
        rosterEntries.flatMap(({ player: rosterPlayer, team, league }) => {
          const player = playersByExternalId.get(rosterPlayer.externalId);

          if (!player) {
            return [];
          }

          const key = createPlayerTeamLeagueKey(player.id, team.id, league.id);
          const existing = existingByKey.get(key);

          return [
            [
              key,
              {
                player,
                team,
                league,
                shirtNumber:
                  rosterPlayer.shirtNumber ?? existing?.shirtNumber ?? null,
                position: existing?.position ?? null,
              },
            ] as const,
          ];
        }),
      ).values(),
    ];

    if (!relationRows.length) {
      return existingRelations;
    }

    await this.relationsRepository.updateMany(relationRows);
    this.logger.log(
      `Match rosters synchronized: ${missingPlayers.length} players inserted, ` +
        `${relationRows.length} relations upserted`,
    );

    return this.relationsRepository.getWhere({
      league: { stage: { id: In(stageIds) } },
    });
  }
}
