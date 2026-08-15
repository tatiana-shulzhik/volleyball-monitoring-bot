import { MigrationInterface, QueryRunner } from 'typeorm';

export class MarkExistingCevData1760000012000 implements MigrationInterface {
  name = 'MarkExistingCevData1760000012000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "sources" ("code", "name", "base_url")
      VALUES ('cev', 'CEV', 'https://www-old.cev.eu')
      ON CONFLICT ("code") DO UPDATE
      SET "name" = EXCLUDED."name", "base_url" = EXCLUDED."base_url"
    `);

    await queryRunner.query(`
      UPDATE "championships"
      SET "source_id" = (SELECT "id" FROM "sources" WHERE "code" = 'cev')
      WHERE "source_id" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "teams"
      SET "source_id" = (SELECT "id" FROM "sources" WHERE "code" = 'cev')
      WHERE "source_id" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "players"
      SET "source_id" = (SELECT "id" FROM "sources" WHERE "code" = 'cev')
      WHERE "source_id" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "synchronization_state"
      SET "source_id" = (SELECT "id" FROM "sources" WHERE "code" = 'cev')
      WHERE "source_id" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "synchronization_state"
      SET "source_id" = NULL
      WHERE "source_id" = (SELECT "id" FROM "sources" WHERE "code" = 'cev')
    `);
    await queryRunner.query(`
      UPDATE "players"
      SET "source_id" = NULL
      WHERE "source_id" = (SELECT "id" FROM "sources" WHERE "code" = 'cev')
    `);
    await queryRunner.query(`
      UPDATE "teams"
      SET "source_id" = NULL
      WHERE "source_id" = (SELECT "id" FROM "sources" WHERE "code" = 'cev')
    `);
    await queryRunner.query(`
      UPDATE "championships"
      SET "source_id" = NULL
      WHERE "source_id" = (SELECT "id" FROM "sources" WHERE "code" = 'cev')
    `);
  }
}
