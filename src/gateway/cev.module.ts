import { Global, Module } from '@nestjs/common';
import { HttpService } from '../shared/http/http.service';
import { CevGateway } from './cev.gateway';

@Global()
@Module({
  providers: [CevGateway, HttpService],
  exports: [CevGateway],
})
export class CevModule {}
