import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMonitoringSubscriptions1760000024000 implements MigrationInterface {
  name = 'CreateMonitoringSubscriptions1760000024000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('monitoring_subscriptions')) return;

    await queryRunner.query(
      `CREATE TABLE "monitoring_subscriptions" ("player_id" integer NOT NULL, "championship_id" integer NOT NULL, CONSTRAINT "PK_monitoring_subscriptions_player_championship" PRIMARY KEY ("player_id", "championship_id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "monitoring_subscriptions" ADD CONSTRAINT "FK_monitoring_subscriptions_player" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "monitoring_subscriptions" ADD CONSTRAINT "FK_monitoring_subscriptions_championship" FOREIGN KEY ("championship_id") REFERENCES "championships"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('monitoring_subscriptions'))) return;

    await queryRunner.query(`DROP TABLE "monitoring_subscriptions"`);
  }
}
