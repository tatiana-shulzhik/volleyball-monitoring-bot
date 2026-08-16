import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLegaMatchPlayerStatistics1760000015000 implements MigrationInterface {
  name = 'CreateLegaMatchPlayerStatistics1760000015000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('lega_match_player_statistics')) return;

    await queryRunner.query(
      `CREATE TABLE "lega_match_player_statistics" ("id" SERIAL NOT NULL, "match_id" integer NOT NULL, "player_id" integer NOT NULL, "team_id" integer NOT NULL, "points" smallint, "shirt_number" smallint, "played" boolean, "source_updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_lega_match_player_statistics_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_lega_match_player_statistics_match_player_team" UNIQUE ("match_id", "player_id", "team_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_lega_match_player_statistics_player" ON "lega_match_player_statistics" ("player_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "lega_match_player_statistics" ADD CONSTRAINT "FK_lega_match_player_statistics_match" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lega_match_player_statistics" ADD CONSTRAINT "FK_lega_match_player_statistics_player" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "lega_match_player_statistics" ADD CONSTRAINT "FK_lega_match_player_statistics_team" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('lega_match_player_statistics'))) return;

    await queryRunner.query(
      `ALTER TABLE "lega_match_player_statistics" DROP CONSTRAINT "FK_lega_match_player_statistics_team"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lega_match_player_statistics" DROP CONSTRAINT "FK_lega_match_player_statistics_player"`,
    );
    await queryRunner.query(
      `ALTER TABLE "lega_match_player_statistics" DROP CONSTRAINT "FK_lega_match_player_statistics_match"`,
    );
    await queryRunner.query(
      `DROP INDEX "IDX_lega_match_player_statistics_player"`,
    );
    await queryRunner.query(`DROP TABLE "lega_match_player_statistics"`);
  }
}
