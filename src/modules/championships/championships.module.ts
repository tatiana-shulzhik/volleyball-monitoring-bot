import { Module } from '@nestjs/common';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { ChampionshipsService } from './championships.service';

@Module({
  providers: [ChampionshipsService, CompetitionStagesRepository],
  exports: [ChampionshipsService, CompetitionStagesRepository],
})
export class ChampionshipsModule {}
