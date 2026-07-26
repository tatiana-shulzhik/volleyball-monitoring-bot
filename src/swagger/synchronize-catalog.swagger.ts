import { applyDecorators } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
} from '@nestjs/swagger';

export const ApiSynchronizeCatalog = (): MethodDecorator =>
  applyDecorators(
    ApiOperation({
      summary: 'Synchronize the full stored catalog range',
      description:
        'Synchronizes seasons, championships, leagues, and teams for the full stored range.',
    }),
    ApiCreatedResponse({
      description: 'Catalog synchronization completed successfully',
      schema: {
        example: { status: 'completed' },
      },
    }),
    ApiConflictResponse({
      description: 'Another synchronization task is already running',
    }),
  );
