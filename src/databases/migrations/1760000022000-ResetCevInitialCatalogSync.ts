import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResetCevInitialCatalogSync1760000022000 implements MigrationInterface {
  name = 'ResetCevInitialCatalogSync1760000022000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "synchronization_state"
      WHERE "key" = 'initial-catalog-country'
        AND "source_id" = (
          SELECT "id" FROM "sources" WHERE "code" = 'cev'
        )
    `);
  }

  async down(): Promise<void> {
    // This migration intentionally does not restore the obsolete sync marker.
  }
}
