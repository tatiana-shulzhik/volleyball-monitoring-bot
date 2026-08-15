import { MigrationInterface, QueryRunner, TableUnique } from 'typeorm';

export class ScopeLeagueExternalIdByStage1760000014000 implements MigrationInterface {
  name = 'ScopeLeagueExternalIdByStage1760000014000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('leagues');
    const oldUnique = table?.uniques.find(
      (unique) =>
        unique.columnNames.length === 1 &&
        unique.columnNames[0] === 'external_id',
    );
    if (oldUnique) await queryRunner.dropUniqueConstraint('leagues', oldUnique);

    const refreshedTable = await queryRunner.getTable('leagues');
    const exists = refreshedTable?.uniques.some(
      (unique) =>
        unique.columnNames.includes('external_id') &&
        unique.columnNames.includes('stage_id'),
    );
    if (!exists) {
      await queryRunner.createUniqueConstraint(
        'leagues',
        new TableUnique({
          name: 'UQ_leagues_external_id_stage',
          columnNames: ['external_id', 'stage_id'],
        }),
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('leagues');
    const scopedUnique = table?.uniques.find(
      (unique) => unique.name === 'UQ_leagues_external_id_stage',
    );
    if (scopedUnique)
      await queryRunner.dropUniqueConstraint('leagues', scopedUnique);
    await queryRunner.createUniqueConstraint(
      'leagues',
      new TableUnique({
        name: 'UQ_leagues_external_id',
        columnNames: ['external_id'],
      }),
    );
  }
}
