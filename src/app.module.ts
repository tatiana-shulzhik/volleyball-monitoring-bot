import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './configs/config.module';
import { ClickHouseModule } from './databases/clickhouse/clickhouse.module';
import { RepositoriesModule } from './databases/repositories/repositories.module';
import { CevModule } from './gateway/cev.module';
import { HealthModule } from './modules/health/health.module';
import { SynchronizationModule } from './modules/synchronization/synchronization.module';
import { TelegramModule } from './modules/telegram/telegram.module';

@Module({
  imports: [
    ConfigModule,
    ClickHouseModule,
    ScheduleModule.forRoot(),
    RepositoriesModule,
    CevModule,
    SynchronizationModule,
    HealthModule,
    TelegramModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
