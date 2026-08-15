import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMatchPlayerAttackStatistics1760000010000 implements MigrationInterface {
  name = 'CreateMatchPlayerAttackStatistics1760000010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "match_player_attack_statistics" ("id" SERIAL NOT NULL, "match_id" integer NOT NULL, "player_id" integer NOT NULL, "team_id" integer NOT NULL, "attempts" integer NOT NULL, "successful" integer NOT NULL, "points" integer, "sets_played" smallint, "source_updated_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_match_attack_stats_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_match_attack_stats_match_player_team" UNIQUE ("match_id", "player_id", "team_id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_match_attack_stats_player" ON "match_player_attack_statistics" ("player_id")`);
    await queryRunner.query(`ALTER TABLE "match_player_attack_statistics" ADD CONSTRAINT "FK_match_attack_stats_match" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "match_player_attack_statistics" ADD CONSTRAINT "FK_match_attack_stats_player" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    await queryRunner.query(`ALTER TABLE "match_player_attack_statistics" ADD CONSTRAINT "FK_match_attack_stats_team" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "match_player_attack_statistics" DROP CONSTRAINT "FK_match_attack_stats_team"`);
    await queryRunner.query(`ALTER TABLE "match_player_attack_statistics" DROP CONSTRAINT "FK_match_attack_stats_player"`);
    await queryRunner.query(`ALTER TABLE "match_player_attack_statistics" DROP CONSTRAINT "FK_match_attack_stats_match"`);
    await queryRunner.query(`DROP INDEX "IDX_match_attack_stats_player"`);
    await queryRunner.query(`DROP TABLE "match_player_attack_statistics"`);
  }
}
