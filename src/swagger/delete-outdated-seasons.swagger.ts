import { applyDecorators } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';

export const ApiDeleteOutdatedSeasons = (): MethodDecorator =>
  applyDecorators(
    ApiOperation({
      summary: 'Delete outdated seasons',
      description: 'Deletes seasons older than the configured stored range.',
    }),
    ApiOkResponse({
      description: 'Outdated seasons deleted successfully',
      schema: {
        example: { deleted: 3 },
      },
    }),
    ApiConflictResponse({
      description: 'Another synchronization task is already running',
    }),
  );
