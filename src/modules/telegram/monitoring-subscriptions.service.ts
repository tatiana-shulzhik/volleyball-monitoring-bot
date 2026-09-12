import { Injectable } from '@nestjs/common';
import { MonitoringSubscriptionsRepository } from '../../databases/repositories/monitoring-subscriptions.repository';
import { ESourceCode } from '../../shared/enums';

@Injectable()
export class MonitoringSubscriptionsService {
  constructor(
    private readonly monitoringSubscriptionsRepository: MonitoringSubscriptionsRepository,
  ) {}

  async toggle(playerId: number, championshipId: number): Promise<boolean> {
    const subscription = await this.monitoringSubscriptionsRepository.findOne(
      playerId,
      championshipId,
    );

    if (subscription) {
      await this.monitoringSubscriptionsRepository.remove(
        playerId,
        championshipId,
      );
      return false;
    }

    await this.monitoringSubscriptionsRepository.create(
      playerId,
      championshipId,
    );
    return true;
  }

  remove(playerId: number, championshipId: number) {
    return this.monitoringSubscriptionsRepository.remove(
      playerId,
      championshipId,
    );
  }

  findAll(sourceCode: ESourceCode) {
    return this.monitoringSubscriptionsRepository.findAll(sourceCode);
  }

  findPlayerIds(playerIds: number[], championshipId: number) {
    if (!playerIds.length) return new Set<number>();

    return this.monitoringSubscriptionsRepository.findPlayerIds(
      playerIds,
      championshipId,
    );
  }
}
