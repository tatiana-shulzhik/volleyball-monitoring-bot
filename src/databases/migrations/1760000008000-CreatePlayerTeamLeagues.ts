import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlayerTeamLeagues1760000008000 implements MigrationInterface {
  name = 'CreatePlayerTeamLeagues1760000008000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "player_team_leagues" ("id" SERIAL NOT NULL, "player_id" integer NOT NULL, "team_id" integer NOT NULL, "league_id" integer NOT NULL, "shirt_number" smallint, "position" character varying, CONSTRAINT "PK_player_team_leagues_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_player_team_league" UNIQUE ("player_id", "team_id", "league_id"))`);
    await queryRunner.query(`ALTER TABLE "player_team_leagues" ADD CONSTRAINT "FK_ptl_player" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "player_team_leagues" ADD CONSTRAINT "FK_ptl_team" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "player_team_leagues" ADD CONSTRAINT "FK_ptl_league" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "player_team_leagues" DROP CONSTRAINT "FK_ptl_league"`);
    await queryRunner.query(`ALTER TABLE "player_team_leagues" DROP CONSTRAINT "FK_ptl_team"`);
    await queryRunner.query(`ALTER TABLE "player_team_leagues" DROP CONSTRAINT "FK_ptl_player"`);
    await queryRunner.query(`DROP TABLE "player_team_leagues"`);
  }
}
