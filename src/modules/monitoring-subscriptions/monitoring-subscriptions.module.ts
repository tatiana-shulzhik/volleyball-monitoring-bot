import { Module } from '@nestjs/common';
import { MonitoringSubscriptionsRepository } from '../../databases/repositories/monitoring-subscriptions.repository';
import { MonitoringSubscriptionsService } from './monitoring-subscriptions.service';

@Module({
  providers: [
    MonitoringSubscriptionsRepository,
    MonitoringSubscriptionsService,
  ],
  exports: [MonitoringSubscriptionsRepository, MonitoringSubscriptionsService],
})
export class MonitoringSubscriptionsModule {}
