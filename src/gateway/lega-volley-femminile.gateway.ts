import { Injectable } from '@nestjs/common';
import {
  LEGA_VOLLEY_FEMMINILE_BASE_URL,
  LEGA_VOLLEY_FEMMINILE_CATALOG_PATH,
} from '../shared/consts/constants';
import { HttpService } from '../shared/http/http.service';
import {
  parseLegaVolleyFemminileCatalog,
  readLegaVolleyFemminileSeasons,
} from '../shared/lega-volley-femminile.utils';

@Injectable()
export class LegaVolleyFemminileGateway {
  constructor(private readonly http: HttpService) {}

  async fetchCatalogSince(earliestYear: number) {
    const catalogUrl = `${LEGA_VOLLEY_FEMMINILE_BASE_URL}${LEGA_VOLLEY_FEMMINILE_CATALOG_PATH}`;
    const firstHtml = await this.http.get(catalogUrl);
    const seasons = readLegaVolleyFemminileSeasons(firstHtml, earliestYear);
    const pages = await Promise.all(
      seasons.map(async (season) => ({
        season,
        html: await this.http.get(`${catalogUrl}?stagione=${season.year}`),
      })),
    );

    return parseLegaVolleyFemminileCatalog(pages);
  }
}
