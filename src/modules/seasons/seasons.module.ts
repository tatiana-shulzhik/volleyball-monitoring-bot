import { Module } from '@nestjs/common';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { SeasonsService } from './seasons.service';

@Module({
  providers: [SeasonsService, SeasonsRepository],
  exports: [SeasonsService, SeasonsRepository],
})
export class SeasonsModule {}
