import { Module } from '@nestjs/common';
import { CevCatalogModule } from '../cev/cev-catalog.module';
import { SynchronizationService } from './synchronization.service';
import { SynchronizationStateRepository } from '../../databases/repositories/synchronization-state.repository';
import { LegaVolleyModule } from '../lega-volley/lega-volley.module';
import { LegaVolleyFemminileModule } from '../lega-volley-femminile/lega-volley-femminile.module';

@Module({
  imports: [CevCatalogModule, LegaVolleyModule, LegaVolleyFemminileModule],
  providers: [SynchronizationService, SynchronizationStateRepository],
})
export class SynchronizationModule {}
