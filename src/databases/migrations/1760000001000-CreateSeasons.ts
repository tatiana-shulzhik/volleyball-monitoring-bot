import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSeasons1760000001000 implements MigrationInterface {
  name = 'CreateSeasons1760000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('seasons')) return;
    await queryRunner.query(`CREATE TABLE "seasons" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, CONSTRAINT "PK_seasons_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_seasons_name" UNIQUE ("name"))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "seasons"`);
  }
}
