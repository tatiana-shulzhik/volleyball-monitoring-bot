import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameCevInitialCatalogKey1760000028000 implements MigrationInterface {
  name = 'RenameCevInitialCatalogKey1760000028000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "synchronization_state"
      SET "key" = 'initial-catalog-cev'
      WHERE "key" = 'initial-catalog-country'
        AND "source_id" = (
          SELECT "id" FROM "sources" WHERE "code" = 'cev'
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "synchronization_state"
      SET "key" = 'initial-catalog-country'
      WHERE "key" = 'initial-catalog-cev'
        AND "source_id" = (
          SELECT "id" FROM "sources" WHERE "code" = 'cev'
        )
    `);
  }
}
