import { Module } from '@nestjs/common';
import { SeasonsModule } from '../seasons/seasons.module';
import { SynchronizationController } from './synchronization.controller';
import { SynchronizationService } from './synchronization.service';

@Module({
  imports: [SeasonsModule],
  controllers: [SynchronizationController],
  providers: [SynchronizationService],
})
export class SynchronizationModule {}
