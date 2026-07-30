import { Module } from '@nestjs/common';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { SeasonsService } from './seasons.service';

@Module({
  providers: [SeasonsService, SeasonsRepository, ChampionshipsRepository],
  exports: [SeasonsService, SeasonsRepository, ChampionshipsRepository],
})
export class SeasonsModule {}
