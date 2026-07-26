import { UnauthorizedException } from '@nestjs/common';
import { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import { SwaggerConfig } from '../configs/swagger.config';

export const swaggerBasicAuthHook =
  (config: SwaggerConfig) =>
  (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction,
  ): void => {
    if (!request.url.startsWith('/swagger')) {
      return done();
    }

    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Basic ')) {
      reply.raw.setHeader('WWW-Authenticate', 'Basic realm="Swagger UI"');
      throw new UnauthorizedException('Authentication required');
    }

    const encodedCredentials = authorization.slice('Basic '.length);
    const credentials = Buffer.from(encodedCredentials, 'base64').toString();
    const separatorIndex = credentials.indexOf(':');
    const username = credentials.slice(0, separatorIndex);
    const password = credentials.slice(separatorIndex + 1);

    if (
      config.username &&
      config.password &&
      username === config.username &&
      password === config.password
    ) {
      return done();
    }

    throw new UnauthorizedException('Invalid credentials');
  };
