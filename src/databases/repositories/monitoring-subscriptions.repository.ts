import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { MonitoringSubscriptionEntity } from '../entities/monitoring-subscription.entity';
import { ESourceCode } from '../../shared/enums';

@Injectable()
export class MonitoringSubscriptionsRepository {
  constructor(
    @InjectRepository(MonitoringSubscriptionEntity)
    private readonly repository: Repository<MonitoringSubscriptionEntity>,
  ) {}

  findOne(playerId: number, championshipId: number) {
    return this.repository.findOneBy({ playerId, championshipId });
  }

  create(playerId: number, championshipId: number) {
    return this.repository.insert({ playerId, championshipId });
  }

  remove(playerId: number, championshipId: number) {
    return this.repository.delete({ playerId, championshipId });
  }

  async removeAll(sourceCode: ESourceCode): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .where(
        '"championship_id" IN (' +
          'SELECT "id" FROM "championships" WHERE "source_id" = (' +
          'SELECT "id" FROM "sources" WHERE "code" = :sourceCode))',
        { sourceCode },
      )
      .execute();

    return result.affected ?? 0;
  }

  findAll(sourceCode: ESourceCode) {
    return this.repository.find({
      where: { championship: { source: { code: sourceCode } } },
      relations: { player: true, championship: true },
      order: { championship: { name: 'ASC' }, player: { fullName: 'ASC' } },
    });
  }

  async findPlayerIds(
    playerIds: number[],
    championshipId: number,
  ): Promise<Set<number>> {
    const subscriptions = await this.repository.find({
      where: { player: { id: In(playerIds) }, championshipId },
      relations: { player: true },
    });
    return new Set(subscriptions.map(({ playerId }) => playerId));
  }
}
