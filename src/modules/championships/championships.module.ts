import { Module } from '@nestjs/common';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { ChampionshipsService } from './championships.service';

@Module({
  providers: [ChampionshipsService, ChampionshipsRepository],
  exports: [ChampionshipsService, ChampionshipsRepository],
})
export class ChampionshipsModule {}
