import { Injectable, Logger } from '@nestjs/common';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { LeaguesRepository } from '../../databases/repositories/leagues.repository';
import { CevGateway } from '../../gateway/cev.gateway';
import { calculateLeagueChanges } from '../../shared/leagues.utils';
import {
  applyEntityChanges,
  logEntityChanges,
} from '../../shared/synchronization.utils';

@Injectable()
export class LeaguesService {
  private readonly logger = new Logger(LeaguesService.name);

  constructor(
    private readonly gateway: CevGateway,
    private readonly repository: LeaguesRepository,
  ) {}

  async synchronize(championships: ChampionshipsEntity[]): Promise<void> {
    if (!championships.length) {
      this.logger.warn('No championships found; leagues sync skipped');
      return;
    }

    this.logger.log(
      `Starting leagues synchronization for ${championships.length} championships`,
    );

    const fetched = await this.gateway.fetchLeagues(championships);
    const existing = await this.repository.findByChampionshipIds(
      championships.map(({ id }) => id),
    );
    const changes = calculateLeagueChanges({
      incoming: fetched.leagues,
      existing,
      championshipsByExternalId: new Map(
        championships.map((championship) => [
          championship.externalId,
          championship,
        ]),
      ),
    });

    await applyEntityChanges({
      repository: this.repository,
      changes,
      allowDeletion: fetched.isComplete,
    });
    logEntityChanges({
      logger: this.logger,
      entityName: 'Leagues',
      changes,
      isComplete: fetched.isComplete,
      allowDeletion: true,
    });
  }
}
