import { MigrationInterface, QueryRunner, TableUnique } from 'typeorm';

export class ScopeExternalIdsBySource1760000020000 implements MigrationInterface {
  name = 'ScopeExternalIdsBySource1760000020000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.replaceUniqueConstraint(
      queryRunner,
      'players',
      ['external_id'],
      ['external_id', 'source_id'],
      'UQ_players_external_id_source',
    );
    await this.replaceUniqueConstraint(
      queryRunner,
      'teams',
      ['external_id'],
      ['external_id', 'source_id'],
      'UQ_teams_external_id_source',
    );
    await this.replaceUniqueConstraint(
      queryRunner,
      'championships',
      ['external_id'],
      ['external_id', 'source_id'],
      'UQ_championships_external_id_source',
    );
    await this.replaceUniqueConstraint(
      queryRunner,
      'matches',
      ['external_id'],
      ['external_id', 'league_id'],
      'UQ_matches_external_id_league',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await this.replaceUniqueConstraint(
      queryRunner,
      'matches',
      ['external_id', 'league_id'],
      ['external_id'],
      'UQ_matches_external_id',
    );
    await this.replaceUniqueConstraint(
      queryRunner,
      'championships',
      ['external_id', 'source_id'],
      ['external_id'],
      'UQ_championships_external_id',
    );
    await this.replaceUniqueConstraint(
      queryRunner,
      'teams',
      ['external_id', 'source_id'],
      ['external_id'],
      'UQ_teams_external_id',
    );
    await this.replaceUniqueConstraint(
      queryRunner,
      'players',
      ['external_id', 'source_id'],
      ['external_id'],
      'UQ_players_external_id',
    );
  }

  private async replaceUniqueConstraint(
    queryRunner: QueryRunner,
    tableName: string,
    oldColumns: string[],
    newColumns: string[],
    newName: string,
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    const oldUnique = table?.uniques.find(
      (unique) =>
        unique.columnNames.length === oldColumns.length &&
        oldColumns.every((column) => unique.columnNames.includes(column)),
    );
    if (oldUnique) {
      await queryRunner.dropUniqueConstraint(tableName, oldUnique);
    }

    const refreshedTable = await queryRunner.getTable(tableName);
    const newUniqueExists = refreshedTable?.uniques.some(
      (unique) =>
        unique.columnNames.length === newColumns.length &&
        newColumns.every((column) => unique.columnNames.includes(column)),
    );
    if (!newUniqueExists) {
      await queryRunner.createUniqueConstraint(
        tableName,
        new TableUnique({ name: newName, columnNames: newColumns }),
      );
    }
  }
}
