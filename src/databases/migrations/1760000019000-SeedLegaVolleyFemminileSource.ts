import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedLegaVolleyFemminileSource1760000019000 implements MigrationInterface {
  name = 'SeedLegaVolleyFemminileSource1760000019000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "sources" ("code", "name", "base_url")
      VALUES (
        'legavolley_femminile',
        'Lega Pallavolo Serie A Femminile',
        'https://www.legavolleyfemminile.it'
      )
      ON CONFLICT ("code") DO UPDATE
      SET "name" = EXCLUDED."name", "base_url" = EXCLUDED."base_url"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "sources" WHERE "code" = 'legavolley_femminile'`,
    );
  }
}
