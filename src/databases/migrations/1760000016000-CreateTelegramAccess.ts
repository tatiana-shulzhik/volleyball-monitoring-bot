import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTelegramAccess1760000016000 implements MigrationInterface {
  name = 'CreateTelegramAccess1760000016000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('telegram_access'))) {
      await queryRunner.query(
        `CREATE TABLE "telegram_access" ("id" SERIAL NOT NULL, "username" character varying NOT NULL, CONSTRAINT "UQ_telegram_access_username" UNIQUE ("username"), CONSTRAINT "PK_telegram_access_id" PRIMARY KEY ("id"))`,
      );
    }
    await queryRunner.query(
      `INSERT INTO "telegram_access" ("username") VALUES ('pentos') ON CONFLICT ("username") DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('telegram_access'))) return;

    await queryRunner.query(`DROP TABLE "telegram_access"`);
  }
}
