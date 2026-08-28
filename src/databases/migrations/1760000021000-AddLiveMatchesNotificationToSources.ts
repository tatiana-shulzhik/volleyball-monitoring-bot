import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLiveMatchesNotificationToSources1760000021000 implements MigrationInterface {
  name = 'AddLiveMatchesNotificationToSources1760000021000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('sources');
    if (!table || table.findColumnByName('live_matches_notification_enabled')) {
      return;
    }

    if (table.findColumnByName('daily_matches_notification_enabled')) {
      await queryRunner.query(
        'ALTER TABLE "sources" RENAME COLUMN "daily_matches_notification_enabled" TO "live_matches_notification_enabled"',
      );
      return;
    }

    await queryRunner.query(
      'ALTER TABLE "sources" ADD "live_matches_notification_enabled" boolean NOT NULL DEFAULT false',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('sources');
    if (!table?.findColumnByName('live_matches_notification_enabled')) {
      return;
    }

    await queryRunner.query(
      'ALTER TABLE "sources" DROP COLUMN "live_matches_notification_enabled"',
    );
  }
}
