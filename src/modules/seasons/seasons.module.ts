import { Module } from '@nestjs/common';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { SeasonsService } from './seasons.service';

@Module({
  providers: [
    SeasonsService,
    SeasonsRepository,
    ChampionshipsRepository,
    CompetitionStagesRepository,
  ],
  exports: [
    SeasonsService,
    SeasonsRepository,
    ChampionshipsRepository,
    CompetitionStagesRepository,
  ],
})
export class SeasonsModule {}
