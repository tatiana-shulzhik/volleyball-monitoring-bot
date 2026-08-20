import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMatches1760000009000 implements MigrationInterface {
  name = 'CreateMatches1760000009000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('matches')) return;
    await queryRunner.query(
      `DO $$
        BEGIN
          CREATE TYPE "public"."matches_status_enum" AS ENUM('scheduled', 'finished', 'cancelled');
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END
      $$`,
    );
    await queryRunner.query(
      `CREATE TABLE "matches" ("id" SERIAL NOT NULL, "external_id" character varying NOT NULL, "league_id" integer NOT NULL, "home_team_id" integer NOT NULL, "away_team_id" integer NOT NULL, "scheduled_at" TIMESTAMP WITH TIME ZONE, "monitoring_started_at" TIMESTAMP WITH TIME ZONE, "attack_statistics_updated_at" TIMESTAMP WITH TIME ZONE, "status" "public"."matches_status_enum" NOT NULL DEFAULT 'scheduled', CONSTRAINT "PK_matches_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_matches_external_id" UNIQUE ("external_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_matches_league" ON "matches" ("league_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_matches_status_attack" ON "matches" ("status", "attack_statistics_updated_at")`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD CONSTRAINT "FK_matches_league" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD CONSTRAINT "FK_matches_home_team" FOREIGN KEY ("home_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" ADD CONSTRAINT "FK_matches_away_team" FOREIGN KEY ("away_team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "FK_matches_away_team"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "FK_matches_home_team"`,
    );
    await queryRunner.query(
      `ALTER TABLE "matches" DROP CONSTRAINT "FK_matches_league"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_matches_status_attack"`);
    await queryRunner.query(`DROP INDEX "IDX_matches_league"`);
    await queryRunner.query(`DROP TABLE "matches"`);
    await queryRunner.query(`DROP TYPE "public"."matches_status_enum"`);
  }
}
