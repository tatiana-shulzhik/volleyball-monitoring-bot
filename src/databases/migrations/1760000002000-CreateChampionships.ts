import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChampionships1760000002000 implements MigrationInterface {
  name = 'CreateChampionships1760000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('championships')) return;
    await queryRunner.query(`CREATE TABLE "championships" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, "external_id" integer NOT NULL, "competition_type" character varying NOT NULL DEFAULT 'club', "source_id" integer, CONSTRAINT "PK_championships_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_championships_external_id" UNIQUE ("external_id"))`);
    await queryRunner.query(`ALTER TABLE "championships" ADD CONSTRAINT "FK_championships_source" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "championships" DROP CONSTRAINT "FK_championships_source"`);
    await queryRunner.query(`DROP TABLE "championships"`);
  }
}
