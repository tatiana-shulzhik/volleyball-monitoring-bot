import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './configs/config.module';
import { RepositoriesModule } from './databases/repositories/repositories.module';
import { HealthModule } from './modules/health/health.module';
import { SeasonsSyncModule } from './modules/seasons-sync/seasons-sync.module';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    RepositoriesModule,
    SeasonsSyncModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
