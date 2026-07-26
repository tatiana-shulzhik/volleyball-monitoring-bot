import { Module } from '@nestjs/common';
import { LeaguesRepository } from '../../databases/repositories/leagues.repository';
import { LeaguesService } from './leagues.service';

@Module({
  providers: [LeaguesService, LeaguesRepository],
  exports: [LeaguesService],
})
export class LeaguesModule {}
