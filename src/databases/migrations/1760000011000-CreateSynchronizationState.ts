import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSynchronizationState1760000011000 implements MigrationInterface {
  name = 'CreateSynchronizationState1760000011000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('synchronization_state')) return;
    await queryRunner.query(`CREATE TABLE "synchronization_state" ("key" character varying NOT NULL, "source_id" integer, "completed_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_synchronization_state_key" PRIMARY KEY ("key"))`);
    await queryRunner.query(`ALTER TABLE "synchronization_state" ADD CONSTRAINT "FK_synchronization_state_source" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "synchronization_state" DROP CONSTRAINT "FK_synchronization_state_source"`);
    await queryRunner.query(`DROP TABLE "synchronization_state"`);
  }
}
