import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTeamLeagues1760000006000 implements MigrationInterface {
  name = 'CreateTeamLeagues1760000006000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "team_leagues" ("id" SERIAL NOT NULL, "team_id" integer NOT NULL, "league_id" integer NOT NULL, CONSTRAINT "PK_team_leagues_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_team_leagues_team_league" UNIQUE ("team_id", "league_id"))`);
    await queryRunner.query(`ALTER TABLE "team_leagues" ADD CONSTRAINT "FK_team_leagues_team" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "team_leagues" ADD CONSTRAINT "FK_team_leagues_league" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "team_leagues" DROP CONSTRAINT "FK_team_leagues_league"`);
    await queryRunner.query(`ALTER TABLE "team_leagues" DROP CONSTRAINT "FK_team_leagues_team"`);
    await queryRunner.query(`DROP TABLE "team_leagues"`);
  }
}
