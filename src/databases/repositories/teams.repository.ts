import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  Repository,
} from 'typeorm';
import { TeamEntity } from '../entities/team.entity';
import { SourcesEntity } from '../entities/sources.entity';
import { ESourceCode } from '../../shared/enums';
import { splitIntoBatches } from '../../shared/array.utils';
import { TeamRosterRow } from '../../interfaces/responses/team-roster.interface';

@Injectable()
export class TeamsRepository {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(TeamEntity)
    private readonly repository: Repository<TeamEntity>,
  ) {}

  useTransaction<T>(
    manager: EntityManager | undefined,
    action: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return manager ? action(manager) : this.dataSource.transaction(action);
  }

  getWhere(
    where: FindOptionsWhere<TeamEntity>,
    manager?: EntityManager,
  ): Promise<TeamEntity[]> {
    const repository = manager?.getRepository(TeamEntity) ?? this.repository;

    return repository.find({ where });
  }

  /**
   * Возвращает строки состава команды в указанной лиге одним SQL-запросом.
   * LEFT JOIN гарантирует, что команда вернётся даже без игроков.
   */
  findLeagueRosterRows(
    teamId: number,
    leagueId: number,
    manager?: EntityManager,
  ): Promise<TeamRosterRow[]> {
    return (manager ?? this.dataSource).query(
      `SELECT
         team.name        AS "teamName",
         player.id        AS "playerId",
         player.full_name AS "playerFullName",
         relation.shirt_number AS "shirtNumber"
       FROM "teams" AS team
       LEFT JOIN "player_team_leagues" AS relation
         ON relation.team_id = team.id AND relation.league_id = $2
       LEFT JOIN "players" AS player
         ON player.id = relation.player_id
       WHERE team.id = $1`,
      [teamId, leagueId],
    );
  }

  async insertMany(teams: Partial<TeamEntity>[], manager?: EntityManager) {
    const repository = manager?.getRepository(TeamEntity) ?? this.repository;
    const source = await (
      manager?.getRepository(SourcesEntity) ??
      this.repository.manager.getRepository(SourcesEntity)
    ).findOneByOrFail({ code: ESourceCode.Cev });

    return repository.insert(teams.map((team) => ({ ...team, source })));
  }

  async updateMany(
    teams: Array<Pick<TeamEntity, 'externalId' | 'name'>>,
    manager?: EntityManager,
    sourceCode = ESourceCode.Cev,
  ) {
    const repository = manager?.getRepository(TeamEntity) ?? this.repository;
    const source = await (
      manager?.getRepository(SourcesEntity) ??
      this.repository.manager.getRepository(SourcesEntity)
    ).findOneByOrFail({ code: sourceCode });
    const values = teams.map(({ externalId, name }) => ({
      externalId,
      name,
      source,
    }));

    return repository.upsert(values, {
      conflictPaths: ['externalId', 'source'],
      skipUpdateIfNoValuesChanged: true,
    });
  }

  async updateCountries(
    updates: Array<{ externalId: string; country: string }>,
    sourceCode = ESourceCode.Cev,
  ): Promise<void> {
    for (const batch of splitIntoBatches(updates)) {
      const params = batch.flatMap(({ externalId, country }) => [
        externalId,
        country,
      ]);
      const values = batch
        .map(
          (_, index) =>
            `($${index * 2 + 1}::varchar, $${index * 2 + 2}::varchar)`,
        )
        .join(', ');

      await this.repository.manager.query(
        `UPDATE "teams" AS team
         SET "country" = input.country
         FROM (VALUES ${values}) AS input(external_id, country)
         INNER JOIN "sources" AS source ON source.code = $${params.length + 1}
         WHERE team.external_id = input.external_id
         AND team.source_id = source.id
         AND team.country IS DISTINCT FROM input.country`,
        [...params, sourceCode],
      );
    }
  }

  deleteMany(ids: number[], manager?: EntityManager) {
    const repository = manager?.getRepository(TeamEntity) ?? this.repository;

    return repository.delete(ids);
  }

  async deleteOrphans(manager: EntityManager): Promise<number> {
    const deleted: Array<{ id: number }> = await manager.query(
      'DELETE FROM teams t WHERE NOT EXISTS ' +
        '(SELECT 1 FROM team_leagues tl WHERE tl.team_id = t.id) ' +
        'AND NOT EXISTS ' +
        '(SELECT 1 FROM player_team_leagues ptl WHERE ptl.team_id = t.id) ' +
        'AND NOT EXISTS ' +
        '(SELECT 1 FROM matches m WHERE m.home_team_id = t.id ' +
        'OR m.away_team_id = t.id) ' +
        'RETURNING t.id',
    );

    return deleted.length;
  }
}
