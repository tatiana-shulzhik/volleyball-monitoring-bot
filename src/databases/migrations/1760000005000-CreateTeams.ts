import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTeams1760000005000 implements MigrationInterface {
  name = 'CreateTeams1760000005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('teams')) return;
    await queryRunner.query(`CREATE TABLE "teams" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "external_id" character varying NOT NULL, "country" character varying, "source_id" integer, CONSTRAINT "PK_teams_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_teams_external_id" UNIQUE ("external_id"))`);
    await queryRunner.query(`ALTER TABLE "teams" ADD CONSTRAINT "FK_teams_source" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "teams" DROP CONSTRAINT "FK_teams_source"`);
    await queryRunner.query(`DROP TABLE "teams"`);
  }
}
