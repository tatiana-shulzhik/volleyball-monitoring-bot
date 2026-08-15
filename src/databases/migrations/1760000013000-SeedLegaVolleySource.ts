import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedLegaVolleySource1760000013000 implements MigrationInterface {
  name = 'SeedLegaVolleySource1760000013000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "sources" ("code", "name", "base_url")
      VALUES ('legavolley', 'Lega Volley Serie A', 'https://www.legavolley.it')
      ON CONFLICT ("code") DO UPDATE
      SET "name" = EXCLUDED."name", "base_url" = EXCLUDED."base_url"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "sources" WHERE "code" = 'legavolley'`,
    );
  }
}
