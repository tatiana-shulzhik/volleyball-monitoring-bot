import { Controller, Delete, Post } from '@nestjs/common';
import { ApiDeleteOutdatedCatalog } from '../../swagger/delete-outdated-catalog.swagger';
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

  @ApiDeleteOutdatedCatalog()
  @Delete('catalog/outdated')
  deleteOutdatedCatalog() {
    return this.synchronization.deleteOutdatedCatalog();
  }
}
