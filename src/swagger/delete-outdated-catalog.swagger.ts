import { applyDecorators } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiOkResponse,
  ApiOperation,
} from '@nestjs/swagger';

export const ApiDeleteOutdatedCatalog = (): MethodDecorator =>
  applyDecorators(
    ApiOperation({
      summary: 'Delete outdated catalog data',
      description:
        'Deletes outdated seasons with dependent entities, then removes orphan players and teams.',
    }),
    ApiOkResponse({
      description: 'Outdated catalog data deleted successfully',
      schema: {
        example: {
          seasons: 2,
          players: 35,
          teams: 4,
        },
      },
    }),
    ApiConflictResponse({
      description: 'Another synchronization task is already running',
    }),
  );
