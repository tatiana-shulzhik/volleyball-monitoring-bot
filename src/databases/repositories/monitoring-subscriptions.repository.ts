import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { MonitoringSubscriptionEntity } from '../entities/monitoring-subscription.entity';
import { ESourceCode } from '../../shared/enums';
import { ICurrentMonitoringSubscription } from '../../interfaces/responses/current-monitoring-subscription.interface';

@Injectable()
export class MonitoringSubscriptionsRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(MonitoringSubscriptionEntity)
    private readonly repository: Repository<MonitoringSubscriptionEntity>,
  ) {}

  findOne(playerId: number, championshipId: number) {
    return this.repository.findOneBy({ playerId, championshipId });
  }

  create(playerId: number, championshipId: number) {
    return this.repository.insert({ playerId, championshipId });
  }

  remove(playerId: number, championshipId: number) {
    return this.repository.delete({ playerId, championshipId });
  }

  async removeAll(sourceCode: ESourceCode): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where(
        '"championship_id" IN (' +
          'SELECT "id" FROM "championships" WHERE "source_id" = (' +
          'SELECT "id" FROM "sources" WHERE "code" = :sourceCode))',
        { sourceCode },
      )
      .execute();

    return result.affected ?? 0;
  }

  findAll(sourceCode: ESourceCode) {
    return this.repository.find({
      where: { championship: { source: { code: sourceCode } } },
      relations: { player: true, championship: true },
      order: { championship: { name: 'ASC' }, player: { fullName: 'ASC' } },
    });
  }

  findAllForCurrentMonitoring(
    sourceCode: ESourceCode,
  ): Promise<ICurrentMonitoringSubscription[]> {
    return this.dataSource.query<ICurrentMonitoringSubscription[]>(
      `SELECT
       p.id AS "playerId",
       p.full_name AS "playerName",
       MIN(ptl.shirt_number) FILTER (WHERE cs.id IS NOT NULL) AS "shirtNumber",
       c.id AS "championshipId",
       c.name AS "championshipName",
       STRING_AGG(DISTINCT t.name, ', ' ORDER BY t.name)
         FILTER (WHERE cs.id IS NOT NULL) AS "teamNames"
     FROM monitoring_subscriptions ms
     JOIN players p ON p.id = ms.player_id
     JOIN championships c ON c.id = ms.championship_id
     JOIN sources s ON s.id = c.source_id
     LEFT JOIN player_team_leagues ptl ON ptl.player_id = p.id
     LEFT JOIN leagues l ON l.id = ptl.league_id
     LEFT JOIN competition_stages cs
       ON cs.id = l.stage_id AND cs.championship_id = c.id
     LEFT JOIN teams t ON t.id = ptl.team_id
     WHERE s.code = $1
     GROUP BY p.id, c.id
     ORDER BY c.name, "shirtNumber" ASC NULLS LAST, p.full_name`,
      [sourceCode],
    );
  }

  async findPlayerIds(
    playerIds: number[],
    championshipId: number,
  ): Promise<Set<number>> {
    const subscriptions = await this.repository.find({
      where: { player: { id: In(playerIds) }, championshipId },
      relations: { player: true },
    });
    return new Set(subscriptions.map(({ playerId }) => playerId));
  }

  async findChampionshipIdsWithSubscriptions(
    championshipIds: number[],
  ): Promise<Set<number>> {
    const subscriptions = await this.repository.find({
      where: { championshipId: In(championshipIds) },
      select: { playerId: true, championshipId: true },
    });

    return new Set(subscriptions.map(({ championshipId }) => championshipId));
  }

  async removeByChampionship(championshipId: number): Promise<number> {
    const result = await this.repository.delete({ championshipId });
    return result.affected ?? 0;
  }

  async findTeamIdsWithSubscriptions(
    championshipId: number,
    stageId: number,
  ): Promise<Set<number>> {
    const rows = await this.dataSource.query<{ teamId: number }[]>(
      `SELECT DISTINCT ptl.team_id AS "teamId"
       FROM monitoring_subscriptions ms
       INNER JOIN player_team_leagues ptl ON ptl.player_id = ms.player_id
       INNER JOIN leagues l ON l.id = ptl.league_id
       WHERE ms.championship_id = $1
         AND l.stage_id = $2`,
      [championshipId, stageId],
    );

    return new Set(rows.map(({ teamId }) => teamId));
  }

  async removeByTeam(
    teamId: number,
    leagueId: number,
    championshipId: number,
  ): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where('"championship_id" = :championshipId', { championshipId })
      .andWhere(
        `"player_id" IN (
          SELECT "player_id" FROM "player_team_leagues"
          WHERE "team_id" = :teamId AND "league_id" = :leagueId
        )`,
        { teamId, leagueId },
      )
      .execute();

    return result.affected ?? 0;
  }
}
