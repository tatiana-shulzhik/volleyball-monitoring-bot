import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResetLegaVolleyInitialCatalogSync1760000023000 implements MigrationInterface {
  name = 'ResetLegaVolleyInitialCatalogSync1760000023000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "synchronization_state"
      WHERE "key" = 'initial-catalog-legavolley'
        AND "source_id" = 5
        AND "completed_at" = TIMESTAMPTZ '2026-08-26 00:35:12.49+03'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "synchronization_state" (
        "key",
        "source_id",
        "completed_at"
      )
      VALUES (
        'initial-catalog-legavolley',
        5,
        TIMESTAMPTZ '2026-08-26 00:35:12.49+03'
      )
      ON CONFLICT ("key") DO NOTHING
    `);
  }
}
