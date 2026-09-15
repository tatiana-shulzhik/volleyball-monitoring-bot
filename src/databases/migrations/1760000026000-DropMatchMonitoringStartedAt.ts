import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropMatchMonitoringStartedAt1760000026000 implements MigrationInterface {
  name = 'DropMatchMonitoringStartedAt1760000026000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('matches', 'monitoring_started_at')) {
      await queryRunner.dropColumn('matches', 'monitoring_started_at');
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('matches', 'monitoring_started_at'))) {
      await queryRunner.query(
        'ALTER TABLE "matches" ADD "monitoring_started_at" TIMESTAMP WITH TIME ZONE',
      );
    }
  }
}
