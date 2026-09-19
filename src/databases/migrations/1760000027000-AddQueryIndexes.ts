import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQueryIndexes1760000027000 implements MigrationInterface {
  name = 'AddQueryIndexes1760000027000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_ptl_league_team" ' +
        'ON "player_team_leagues" ("league_id", "team_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_team_leagues_league" ' +
        'ON "team_leagues" ("league_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_monitoring_subscriptions_championship" ' +
        'ON "monitoring_subscriptions" ("championship_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_matches_home_team" ' +
        'ON "matches" ("home_team_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_matches_away_team" ' +
        'ON "matches" ("away_team_id")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_match_attack_stats_team" ' +
        'ON "match_player_attack_statistics" ("team_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_match_attack_stats_team"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_matches_away_team"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_matches_home_team"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_monitoring_subscriptions_championship"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_team_leagues_league"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_ptl_league_team"');
  }
}
