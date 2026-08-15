import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSources1760000000000 implements MigrationInterface {
  name = 'CreateSources1760000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "sources" ("id" SERIAL NOT NULL, "code" character varying NOT NULL, "name" character varying NOT NULL, "base_url" character varying NOT NULL, CONSTRAINT "PK_sources_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_sources_code" UNIQUE ("code"))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sources"`);
  }
}
