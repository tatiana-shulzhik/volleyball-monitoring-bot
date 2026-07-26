import { Controller, Delete, Post } from '@nestjs/common';
import { ApiDeleteOutdatedSeasons } from '../../swagger/delete-outdated-seasons.swagger';
import { ApiSynchronizeCatalog } from '../../swagger/synchronize-catalog.swagger';
import { ApiSynchronizationController } from '../../swagger/synchronization.swagger';
import { SynchronizationService } from './synchronization.service';

@ApiSynchronizationController()
@Controller('sync')
export class SynchronizationController {
  constructor(private readonly synchronization: SynchronizationService) {}

  @ApiSynchronizeCatalog()
  @Post('catalog')
  async synchronizeCatalog() {
    await this.synchronization.synchronizeStoredCatalogRange();

    return { status: 'completed' };
  }

  @ApiDeleteOutdatedSeasons()
  @Delete('seasons/outdated')
  async deleteOutdatedSeasons() {
    const deleted = await this.synchronization.deleteOutdatedSeasons();

    return { deleted };
  }
}
