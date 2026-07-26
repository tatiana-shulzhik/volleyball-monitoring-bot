import { applyDecorators } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

export const ApiSynchronizationController = (): ClassDecorator =>
  applyDecorators(ApiTags('Synchronization'));
