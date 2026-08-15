import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlayers1760000007000 implements MigrationInterface {
  name = 'CreatePlayers1760000007000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "players" ("id" SERIAL NOT NULL, "full_name" character varying NOT NULL, "external_id" character varying NOT NULL, "birth_year" smallint, "source_id" integer, CONSTRAINT "PK_players_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_players_external_id" UNIQUE ("external_id"))`);
    await queryRunner.query(`ALTER TABLE "players" ADD CONSTRAINT "FK_players_source" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "players" DROP CONSTRAINT "FK_players_source"`);
    await queryRunner.query(`DROP TABLE "players"`);
  }
}
