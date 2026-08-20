import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeLegaMatchExternalIdNullable1760000017000 implements MigrationInterface {
  name = 'MakeLegaMatchExternalIdNullable1760000017000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "matches" ALTER COLUMN "external_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "matches" m
       SET "external_id" = NULL,
           "attack_statistics_updated_at" = NULL
       FROM "leagues" l
       JOIN "competition_stages" cs ON cs.id = l.stage_id
       JOIN "championships" c ON c.id = cs.championship_id
       JOIN "sources" s ON s.id = c.source_id
       WHERE m.league_id = l.id
         AND s.code = 'legavolley'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "matches" m
       SET "external_id" = 'legavolley:' || season.name || ':' || l.external_id || ':' || m.id
       FROM "leagues" l
       JOIN "competition_stages" cs ON cs.id = l.stage_id
       JOIN "seasons" season ON season.id = cs.season_id
       JOIN "championships" c ON c.id = cs.championship_id
       JOIN "sources" s ON s.id = c.source_id
       WHERE m.league_id = l.id
         AND s.code = 'legavolley'
         AND m.external_id IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ALTER COLUMN "external_id" SET NOT NULL`,
    );
  }
}
