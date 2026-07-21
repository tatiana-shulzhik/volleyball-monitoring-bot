
import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '../../configs/config.module';

@Global()
@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([]),
  ],
  providers: [],
  exports: [],
})
export class RepositoriesModule {
}
