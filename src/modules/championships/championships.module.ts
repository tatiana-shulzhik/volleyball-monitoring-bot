import { Module } from '@nestjs/common';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { ChampionshipsService } from './championships.service';

@Module({
  providers: [
    ChampionshipsService,
    CompetitionStagesRepository,
    ChampionshipsRepository,
  ],
  exports: [
    ChampionshipsService,
    ChampionshipsRepository,
    CompetitionStagesRepository,
  ],
})
export class ChampionshipsModule {}
