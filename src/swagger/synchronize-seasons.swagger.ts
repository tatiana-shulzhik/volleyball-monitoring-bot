import { applyDecorators } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOperation,
} from '@nestjs/swagger';

export const ApiSynchronizeSeasons = (): MethodDecorator =>
  applyDecorators(
    ApiOperation({
      summary: 'Synchronize the full stored seasons range',
      description:
        'Loads seasons from the earliest stored year through future years.',
    }),
    ApiCreatedResponse({
      description: 'Seasons synchronization completed successfully',
      schema: {
        example: { status: 'completed' },
      },
    }),
    ApiConflictResponse({
      description: 'Another synchronization task is already running',
    }),
  );
