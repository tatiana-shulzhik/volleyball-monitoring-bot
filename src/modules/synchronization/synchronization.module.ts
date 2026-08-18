import { Module } from '@nestjs/common';
import { CevCatalogModule } from '../cev/cev-catalog.module';
import { SynchronizationService } from './synchronization.service';
import { SynchronizationStateRepository } from '../../databases/repositories/synchronization-state.repository';
import { LegaVolleyModule } from '../lega-volley/lega-volley.module';

@Module({
  imports: [CevCatalogModule, LegaVolleyModule],
  providers: [SynchronizationService, SynchronizationStateRepository],
})
export class SynchronizationModule {}
