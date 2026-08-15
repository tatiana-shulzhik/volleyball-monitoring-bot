import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableForeignKey,
} from 'typeorm';

export class AddSourceColumns1760000011500 implements MigrationInterface {
  name = 'AddSourceColumns1760000011500';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('sources'))) {
      await queryRunner.query(
        `CREATE TABLE "sources" ("id" SERIAL NOT NULL, "code" character varying NOT NULL, "name" character varying NOT NULL, "base_url" character varying NOT NULL, CONSTRAINT "PK_sources_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_sources_code" UNIQUE ("code"))`,
      );
    }

    for (const table of [
      'championships',
      'teams',
      'players',
      'synchronization_state',
    ]) {
      if (!(await queryRunner.hasColumn(table, 'source_id'))) {
        await queryRunner.addColumn(
          table,
          new TableColumn({
            name: 'source_id',
            type: 'integer',
            isNullable: true,
          }),
        );
      }

      const tableMetadata = await queryRunner.getTable(table);
      const foreignKeyName = `FK_${table}_source`;
      if (
        !tableMetadata?.foreignKeys.some(({ name }) => name === foreignKeyName)
      ) {
        await queryRunner.createForeignKey(
          table,
          new TableForeignKey({
            name: foreignKeyName,
            columnNames: ['source_id'],
            referencedTableName: 'sources',
            referencedColumnNames: ['id'],
            onDelete:
              table === 'synchronization_state' ? 'CASCADE' : 'RESTRICT',
          }),
        );
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'synchronization_state',
      'players',
      'teams',
      'championships',
    ]) {
      const tableMetadata = await queryRunner.getTable(table);
      const foreignKey = tableMetadata?.foreignKeys.find(
        ({ name }) => name === `FK_${table}_source`,
      );
      if (foreignKey) await queryRunner.dropForeignKey(table, foreignKey);
      if (await queryRunner.hasColumn(table, 'source_id')) {
        await queryRunner.dropColumn(table, 'source_id');
      }
    }
  }
}
