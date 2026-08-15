import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCompetitionStages1760000003000 implements MigrationInterface {
  name = 'CreateCompetitionStages1760000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('competition_stages')) return;
    await queryRunner.query(`CREATE TABLE "competition_stages" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "external_id" integer NOT NULL, "starts_at" TIMESTAMP WITH TIME ZONE, "ends_at" TIMESTAMP WITH TIME ZONE, "season_id" integer, "championship_id" integer NOT NULL, CONSTRAINT "PK_competition_stages_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_stage_external_championship" UNIQUE ("external_id", "championship_id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_stages_season" ON "competition_stages" ("season_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_stages_championship" ON "competition_stages" ("championship_id")`);
    await queryRunner.query(`ALTER TABLE "competition_stages" ADD CONSTRAINT "FK_stages_season" FOREIGN KEY ("season_id") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "competition_stages" ADD CONSTRAINT "FK_stages_championship" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "competition_stages" DROP CONSTRAINT "FK_stages_championship"`);
    await queryRunner.query(`ALTER TABLE "competition_stages" DROP CONSTRAINT "FK_stages_season"`);
    await queryRunner.query(`DROP INDEX "IDX_stages_championship"`);
    await queryRunner.query(`DROP INDEX "IDX_stages_season"`);
    await queryRunner.query(`DROP TABLE "competition_stages"`);
  }
}
