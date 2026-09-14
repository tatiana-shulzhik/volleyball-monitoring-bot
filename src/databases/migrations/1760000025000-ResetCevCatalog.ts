import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResetCevCatalog1760000025000 implements MigrationInterface {
  name = 'ResetCevCatalog1760000025000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "championships"
      WHERE "source_id" = (SELECT "id" FROM "sources" WHERE "code" = 'cev')
    `);
    await queryRunner.query(`
      DELETE FROM "players"
      WHERE "source_id" = (SELECT "id" FROM "sources" WHERE "code" = 'cev')
    `);
    await queryRunner.query(`
      DELETE FROM "teams"
      WHERE "source_id" = (SELECT "id" FROM "sources" WHERE "code" = 'cev')
    `);
    await queryRunner.query(`
      DELETE FROM "synchronization_state"
      WHERE "key" = 'initial-catalog-country'
        AND "source_id" = (SELECT "id" FROM "sources" WHERE "code" = 'cev')
    `);
  }

  async down(): Promise<void> {}
}
