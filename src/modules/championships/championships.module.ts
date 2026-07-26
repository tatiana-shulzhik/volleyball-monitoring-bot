import { Module } from '@nestjs/common';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { ChampionshipsService } from './championships.service';

@Module({
  providers: [ChampionshipsService, ChampionshipsRepository, SeasonsRepository],
  exports: [ChampionshipsService],
})
export class ChampionshipsModule {}
