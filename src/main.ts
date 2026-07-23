import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './configs/app.config';
import { Logger } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';

async function bootstrap() {
  const fastifyAdapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
  );
  const config = app.get(AppConfig);
  const logger = new Logger('Bootstrap');

  await app.listen(process.env.APP_PORT ?? 3000);
  await app.listen(config.port ?? 3000, '0.0.0.0', () => {
    logger.debug(`Service available on ${config.port}`);
  });
}
bootstrap();
