import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropLegaMatchPlayerStatistics1760000018000 implements MigrationInterface {
  name = 'DropLegaMatchPlayerStatistics1760000018000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasTable('lega_match_player_statistics'))) return;

    await queryRunner.query(`DROP TABLE "lega_match_player_statistics"`);
  }

  down(): Promise<void> {
    return Promise.resolve();
  }
}
