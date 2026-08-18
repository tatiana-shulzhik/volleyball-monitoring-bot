import { Injectable } from '@nestjs/common';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { ISeason } from '../../interfaces/requests/seasons.interface';
import { uniqueBy } from '../../shared/array.utils';

@Injectable()
export class SeasonsService {
  constructor(private readonly seasonsRepository: SeasonsRepository) {}

  async upsertCatalogSeasons(
    stages: Array<{ seasonName?: string }>,
  ): Promise<Map<string, SeasonsEntity>> {
    await this.seasonsRepository.upsertMany(this.toSeasons(stages));

    return new Map(
      (await this.seasonsRepository.getWhere({})).map((season) => [
        season.name,
        season,
      ]),
    );
  }

  private toSeasons(stages: Array<{ seasonName?: string }>): ISeason[] {
    return uniqueBy(
      stages.flatMap(({ seasonName }) =>
        seasonName ? [{ name: seasonName }] : [],
      ),
      (season) => season.name,
    );
  }
}
