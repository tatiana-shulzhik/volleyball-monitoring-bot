import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedTelegramAccess1760000029000 implements MigrationInterface {
  name = 'SeedTelegramAccess1760000029000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "telegram_access" ("username") VALUES ('tatyana9182') ON CONFLICT ("username") DO NOTHING`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "telegram_access" WHERE "username" = 'tatyana9182'`,
    );
  }
}
