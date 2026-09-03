import { Injectable, Logger } from '@nestjs/common';
import { In } from 'typeorm';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { LeaguesRepository } from '../../databases/repositories/leagues.repository';
import {
  FetchedLeagueCatalog,
  ICevLeague,
} from '../../interfaces/requests/leagues.interface';
import { SynchronizedLeagues } from '../../interfaces/responses/synchronized-leagues.interface';
import { createCompetitionStageKey } from '../../shared/competition-stages.utils';
import { calculateLeagueChanges } from '../../shared/leagues.utils';
import { applyEntityChanges } from '../../shared/synchronization.utils';
import { ESourceCode } from '../../shared/enums';
import { uniqueBy } from '../../shared/array.utils';

@Injectable()
export class LeaguesService {
  private readonly logger = new Logger(LeaguesService.name);

  constructor(private readonly repository: LeaguesRepository) {}

  async upsertCatalogLeagues(
    leagues: ICevLeague[],
    stagesByKey: Map<string, CompetitionStagesEntity>,
    sourceCode: ESourceCode,
  ): Promise<Map<number, LeaguesEntity>> {
    await this.repository.updateMany(
      uniqueBy(
        leagues,
        (league) =>
          `${league.externalId}:${league.championshipExternalId}:${league.stageExternalId}`,
      ).map((league) => ({
        externalId: league.externalId,
        name: league.name,
        stage: stagesByKey.get(
          `${league.championshipExternalId}:${league.stageExternalId}`,
        ),
      })),
    );

    return new Map(
      (
        await this.repository.getWhere({
          stage: { championship: { source: { code: sourceCode } } },
        })
      ).map((league) => [league.externalId, league]),
    );
  }

  getBySource(sourceCode: ESourceCode): Promise<LeaguesEntity[]> {
    return this.repository.getWhere({
      stage: { championship: { source: { code: sourceCode } } },
    });
  }

  async synchronize(
    stages: CompetitionStagesEntity[],
    fetched: FetchedLeagueCatalog,
  ): Promise<SynchronizedLeagues> {
    if (!stages.length) {
      this.logger.warn('No championships found; leagues sync skipped');
      return { leagues: [], teams: [], isComplete: true };
    }

    const stageIds = stages.map(({ id }) => id);
    const existing = await this.repository.getWhere({
      stage: { id: In(stageIds) },
    });
    const changes = calculateLeagueChanges({
      incoming: fetched.leagues,
      existing,
      stagesByKey: new Map(
        stages.map((stage) => [
          createCompetitionStageKey(
            stage.championship.externalId,
            stage.externalId,
          ),
          stage,
        ]),
      ),
    });

    await applyEntityChanges({
      repository: this.repository,
      changes,
      allowDeletion: fetched.isComplete,
    });
    return {
      leagues: await this.repository.getWhere({
        stage: { id: In(stageIds) },
      }),
      teams: fetched.teams,
      isComplete: fetched.isComplete,
    };
  }
}
