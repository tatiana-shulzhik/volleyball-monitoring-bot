import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './configs/app.config';
import { SwaggerConfig } from './configs/swagger.config';
import { Logger } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { swaggerBasicAuthHook } from './swagger/swagger-basic-auth.hook';

async function bootstrap() {
  const fastifyAdapter = new FastifyAdapter();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    fastifyAdapter,
  );
  const config = app.get(AppConfig);
  const swagger = app.get(SwaggerConfig);
  const logger = new Logger('Bootstrap');
  const fastify = fastifyAdapter.getInstance();
  fastify.addHook('onRequest', swaggerBasicAuthHook(swagger));

  const swaggerConfig = new DocumentBuilder()
    .setTitle(config.name || 'Volleyball monitoring bot')
    .setDescription('Synchronization API')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('swagger', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = config.port ?? 3000;
  await app.listen(port, '0.0.0.0');
  logger.debug(`Service available on ${port}`);
}
void bootstrap();
