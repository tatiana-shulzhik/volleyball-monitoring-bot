import { Controller, Delete, Post } from '@nestjs/common';
import { ApiDeleteOutdatedSeasons } from '../../swagger/delete-outdated-seasons.swagger';
import { ApiSynchronizationController } from '../../swagger/synchronization.swagger';
import { ApiSynchronizeSeasons } from '../../swagger/synchronize-seasons.swagger';
import { SynchronizationService } from './synchronization.service';

@ApiSynchronizationController()
@Controller('sync')
export class SynchronizationController {
  constructor(private readonly synchronization: SynchronizationService) {}

  @ApiSynchronizeSeasons()
  @Post('seasons')
  async synchronizeSeasons() {
    await this.synchronization.synchronizeStoredSeasonsRange();

    return { status: 'completed' };
  }

  @ApiDeleteOutdatedSeasons()
  @Delete('seasons/outdated')
  async deleteOutdatedSeasons() {
    const deleted = await this.synchronization.deleteOutdatedSeasons();

    return { deleted };
  }
}
