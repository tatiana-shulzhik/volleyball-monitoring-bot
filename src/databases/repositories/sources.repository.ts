import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ESourceCode } from '../../shared/enums';
import { SourcesEntity } from '../entities/sources.entity';

@Injectable()
export class SourcesRepository {
  constructor(
    @InjectRepository(SourcesEntity)
    private readonly repository: Repository<SourcesEntity>,
  ) {}

  findByCodeOrFail(code: ESourceCode): Promise<SourcesEntity> {
    return this.repository.findOneByOrFail({ code });
  }

  findWithLiveMatchesNotifications(): Promise<SourcesEntity[]> {
    return this.repository.find({
      where: { liveMatchesNotificationEnabled: true },
      order: { name: 'ASC' },
    });
  }

  async toggleLiveMatchesNotification(
    code: ESourceCode,
  ): Promise<SourcesEntity> {
    const source = await this.findByCodeOrFail(code);
    source.liveMatchesNotificationEnabled =
      !source.liveMatchesNotificationEnabled;
    return this.repository.save(source);
  }
}
