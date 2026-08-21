import { Global, Module } from '@nestjs/common';
import { HttpService } from '../shared/http/http.service';
import { CevGateway } from './cev.gateway';
import { LegaVolleyGateway } from './lega-volley.gateway';
import { LegaVolleyFemminileGateway } from './lega-volley-femminile.gateway';

@Global()
@Module({
  providers: [
    CevGateway,
    LegaVolleyGateway,
    LegaVolleyFemminileGateway,
    HttpService,
  ],
  exports: [CevGateway, LegaVolleyGateway, LegaVolleyFemminileGateway],
})
export class CevModule {}
