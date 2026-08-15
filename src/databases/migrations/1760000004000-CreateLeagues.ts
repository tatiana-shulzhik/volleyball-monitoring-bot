import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLeagues1760000004000 implements MigrationInterface {
  name = 'CreateLeagues1760000004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('leagues')) return;
    await queryRunner.query(`CREATE TABLE "leagues" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "external_id" integer NOT NULL, "stage_id" integer NOT NULL, CONSTRAINT "PK_leagues_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_leagues_external_id" UNIQUE ("external_id"))`);
    await queryRunner.query(`ALTER TABLE "leagues" ADD CONSTRAINT "FK_leagues_stage" FOREIGN KEY ("stage_id") REFERENCES "competition_stages"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "leagues" DROP CONSTRAINT "FK_leagues_stage"`);
    await queryRunner.query(`DROP TABLE "leagues"`);
  }
}
