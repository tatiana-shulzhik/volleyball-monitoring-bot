import { Global, Module } from '@nestjs/common';
import { HttpService } from '../shared/http/http.service';
import { CevGateway } from './cev.gateway';
import { LegaVolleyGateway } from './lega-volley.gateway';

@Global()
@Module({
  providers: [CevGateway, LegaVolleyGateway, HttpService],
  exports: [CevGateway, LegaVolleyGateway],
})
export class CevModule {}
