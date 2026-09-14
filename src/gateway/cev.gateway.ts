import { Injectable, Logger } from '@nestjs/common';
import { ChampionshipsEntity } from '../databases/entities/championships.entity';
import { CompetitionStagesEntity } from '../databases/entities/competition-stages.entity';
import { MatchEntity } from '../databases/entities/match.entity';
import {
  FetchedCompetitionStages,
  ICevCompetitionStage,
} from '../interfaces/requests/competition-stages.interface';
import { FetchedLeagueCatalog } from '../interfaces/requests/leagues.interface';
import { IFetchedMatches } from '../interfaces/requests/matches.interface';
import { IFetchedPlayers } from '../interfaces/requests/players.interface';
import {
  IFetchedMatchAttackStatistics,
  IFetchedMatchLineup,
  IFetchedMatchRoster,
} from '../interfaces/requests/player-statistics.interface';
import { ICevChampionship } from '../interfaces/requests/championships.interface';
import { IFetchedSeasonCatalog } from '../interfaces/requests/seasons.interface';
import { IPlayerRosterSource } from '../interfaces/responses/synchronized-teams.interface';
import { extractChampionships } from '../shared/cev-championships.utils';
import {
  extractLeagueCountryCodes,
  extractLeagues,
} from '../shared/cev-leagues.utils';
import { extractMatches } from '../shared/cev-matches.utils';
import {
  extractMatchRoster,
  extractMatchLineup,
  extractPlayerAttackStatistics,
} from '../shared/cev-player-statistics.utils';
import { extractTeams } from '../shared/cev-teams.utils';
import {
  extractCevPlayerBirthYears,
  extractCevTeamCountry,
  extractCevTeamPlayers,
} from '../shared/cev-team-country.utils';
import { normalizePlayerName } from '../shared/player-name.utils';
import { getErrorMessage } from '../shared/error.utils';
import {
  createCalendarForm,
  createNationalTeamCalendarForm,
  extractCalendarChampionships,
  getCalendarMetadata,
} from '../shared/cev-calendar.utils';
import { ECompetitionType } from '../shared/enums';
import { createCompetitionStageKey } from '../shared/competition-stages.utils';
import { parseSeasonEndYear } from '../shared/season.utils';
import {
  CEV_HTTP_CONCURRENCY,
  CEV_HTML_CACHE_MAX_ENTRIES,
  CEV_CALENDAR_URL,
  createCompetitionUrl,
  createTeamDetailsUrl,
  createMatchPageUrl,
  createMatchesUrl,
  createMatchStatisticsUrl,
} from '../shared/consts/constants';
import { HttpService } from '../shared/http/http.service';

interface IMapSettledParams<TInput, TOutput> {
  items: TInput[];
  mapper: (item: TInput) => Promise<TOutput>;
  concurrency: number;
}

@Injectable()
export class CevGateway {
  private readonly logger = new Logger(CevGateway.name);
  private readonly matchStatisticsCache = new Map<
    string,
    { html: string; expiresAt: number }
  >();
  private readonly teamDetailsCache = new Map<
    string,
    { html: string; expiresAt: number }
  >();
  private readonly teamDetailsRequests = new Map<string, Promise<string>>();

  constructor(private readonly http: HttpService) {}

  async fetchSeasonCatalogSince(
    earliestYear: number,
  ): Promise<IFetchedSeasonCatalog> {
    const initialHtml = await this.http.get(CEV_CALENDAR_URL);
    const calendarResults = await Promise.allSettled([
      Promise.resolve({
        html: initialHtml,
        competitionType: ECompetitionType.Club,
      }),
      this.fetchNationalTeamCalendar(initialHtml).then((html) => ({
        html,
        competitionType: ECompetitionType.NationalTeam,
      })),
    ]);
    const requests = calendarResults.flatMap((calendarResult) => {
      if (calendarResult.status === 'rejected') {
        return [];
      }

      const { html, competitionType } = calendarResult.value;
      const { availableYears, selectedYear } = getCalendarMetadata(html);

      return availableYears
        .filter((year) => year >= earliestYear)
        .map((year) =>
          (year === selectedYear
            ? Promise.resolve(html)
            : this.fetchCalendarYear(html, year)
          ).then((yearHtml) => ({
            html: yearHtml,
            competitionType,
            calendarYear: year,
          })),
        );
    });
    const results = await Promise.allSettled(requests);
    const championships = new Map<number, ICevChampionship>();
    const stages = new Map<string, ICevCompetitionStage>();

    for (const result of results) {
      if (result.status === 'rejected') {
        continue;
      }

      const extracted = extractCalendarChampionships(
        result.value.html,
        result.value.competitionType,
        result.value.calendarYear,
      );

      for (const championship of extracted.championships) {
        championships.set(championship.externalId, championship);
      }

      for (const stage of extracted.stages) {
        const key = createCompetitionStageKey(
          stage.championshipExternalId,
          stage.externalId,
        );
        const existing = stages.get(key);

        if (
          existing &&
          (parseSeasonEndYear(existing.seasonName) ?? 0) >=
            (parseSeasonEndYear(stage.seasonName) ?? 0)
        ) {
          continue;
        }

        stages.set(key, stage);
      }
    }

    return {
      championships: [...championships.values()],
      stages: [...stages.values()],
      isComplete:
        calendarResults.every((result) => result.status === 'fulfilled') &&
        results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchCompetitionStages(
    championships: ChampionshipsEntity[],
  ): Promise<FetchedCompetitionStages> {
    const results = await this.mapSettled({
      items: championships,
      mapper: async (championship) =>
        extractChampionships(
          await this.http.get(createCompetitionUrl(championship.externalId)),
          championship.externalId,
        ),
      concurrency: 5,
    });

    return {
      stages: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      ),
      isComplete: results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchLeagueCatalog(
    stages: CompetitionStagesEntity[],
  ): Promise<FetchedLeagueCatalog> {
    const results = await this.mapSettled({
      items: stages,
      mapper: async (stage) => {
        const html = await this.http.get(
          createCompetitionUrl(stage.championship.externalId, stage.externalId),
        );
        const leagues = extractLeagues(
          html,
          stage.externalId,
          stage.championship.externalId,
        );

        return {
          leagues,
          teams: extractTeams(html, leagues),
        };
      },
      concurrency: 5,
    });

    return {
      leagues: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value.leagues : [],
      ),
      teams: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value.teams : [],
      ),
      isComplete: results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchPlayers(
    matches: MatchEntity[],
    teamPlayersBySource: Map<string, IFetchedMatchRoster['home']>,
    birthYears = new Map<string, number>(),
  ): Promise<IFetchedPlayers> {
    const results = await this.mapSettled({
      items: matches,
      mapper: async (match) => {
        if (!match.externalId) {
          throw new Error(`CEV match ${match.id} has no external ID`);
        }
        const statisticsHtml = await this.getMatchStatisticsHtml(
          match.externalId,
        );
        const championshipExternalId =
          match.league.stage.championship.externalId;

        return {
          players: [
            ...getMatchStatisticsPlayers(
              extractMatchLineup(statisticsHtml, 'casa'),
              teamPlayersBySource.get(
                createTeamDetailsKey(
                  match.homeTeam.externalId,
                  championshipExternalId,
                ),
              ) ?? [],
            ).map((player) => ({
              externalId: player.externalId,
              fullName: player.playerName,
              position: player.position ?? '',
              shirtNumber: player.shirtNumber,
              birthYear: birthYears.get(player.externalId) ?? null,
              teamExternalId: match.homeTeam.externalId,
              leagueExternalId: match.league.externalId,
            })),
            ...getMatchStatisticsPlayers(
              extractMatchLineup(statisticsHtml, 'ospiti'),
              teamPlayersBySource.get(
                createTeamDetailsKey(
                  match.awayTeam.externalId,
                  championshipExternalId,
                ),
              ) ?? [],
            ).map((player) => ({
              externalId: player.externalId,
              fullName: player.playerName,
              position: player.position ?? '',
              shirtNumber: player.shirtNumber,
              birthYear: birthYears.get(player.externalId) ?? null,
              teamExternalId: match.awayTeam.externalId,
              leagueExternalId: match.league.externalId,
            })),
          ],
        };
      },
      concurrency: CEV_HTTP_CONCURRENCY,
    });

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        return;
      }

      const match = matches[index];
      const url = match.externalId
        ? createMatchPageUrl(
            match.league.stage.championship.externalId,
            match.league.externalId,
            match.externalId,
          )
        : '(missing match ID)';

      this.logger.warn(
        `Player roster request failed for "${match.homeTeam.name}" — ` +
          `"${match.awayTeam.name}" (${url}): ${getErrorMessage(result.reason)}`,
      );
    });

    return {
      players: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value.players : [],
      ),
      teamCountries: [],
      isComplete: results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchTeamCountries(
    sources: IPlayerRosterSource[],
  ): Promise<Array<{ teamExternalId: string; country: string }>> {
    const uniqueSources = [
      ...new Map(
        sources.map((source) => [
          `${source.team.externalId}:${source.championship.externalId}`,
          source,
        ]),
      ).values(),
    ];
    const results = await this.mapSettled({
      items: uniqueSources,
      mapper: async ({ team, championship }) => {
        const html = await this.getTeamDetailsHtml(
          team.externalId,
          championship.externalId,
        );
        const country = extractCevTeamCountry(html);

        return country ? { teamExternalId: team.externalId, country } : null;
      },
      concurrency: CEV_HTTP_CONCURRENCY,
    });

    return results.flatMap((result) =>
      result.status === 'fulfilled' && result.value ? [result.value] : [],
    );
  }

  async fetchTeamPlayerBirthYears(
    sources: IPlayerRosterSource[],
  ): Promise<Map<string, number>> {
    const uniqueSources = [
      ...new Map(
        sources.map((source) => [
          `${source.team.externalId}:${source.championship.externalId}`,
          source,
        ]),
      ).values(),
    ];
    const results = await this.mapSettled({
      items: uniqueSources,
      mapper: async ({ team, championship }) =>
        extractCevPlayerBirthYears(
          await this.getTeamDetailsHtml(
            team.externalId,
            championship.externalId,
          ),
        ),
      concurrency: CEV_HTTP_CONCURRENCY,
    });

    return new Map(
      results.flatMap((result) =>
        result.status === 'fulfilled' ? [...result.value.entries()] : [],
      ),
    );
  }

  async fetchTeamPlayers(
    sources: IPlayerRosterSource[],
  ): Promise<Map<string, IFetchedMatchRoster['home']>> {
    const uniqueSources = [
      ...new Map(
        sources.map((source) => [
          createTeamDetailsKey(
            source.team.externalId,
            source.championship.externalId,
          ),
          source,
        ]),
      ).values(),
    ];
    const results = await this.mapSettled({
      items: uniqueSources,
      mapper: async ({ team, championship }) =>
        [
          createTeamDetailsKey(team.externalId, championship.externalId),
          extractCevTeamPlayers(
            await this.getTeamDetailsHtml(
              team.externalId,
              championship.externalId,
            ),
          ),
        ] as const,
      concurrency: CEV_HTTP_CONCURRENCY,
    });

    return new Map(
      results.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      ),
    );
  }

  async fetchMatches(
    stages: CompetitionStagesEntity[],
  ): Promise<IFetchedMatches> {
    const results = await this.mapSettled({
      items: stages,
      mapper: async (stage) => {
        const html = await this.http.get(
          createMatchesUrl(stage.championship.externalId, stage.externalId),
        );
        return extractMatches(html, extractLeagueCountryCodes(html));
      },
      concurrency: CEV_HTTP_CONCURRENCY,
    });

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return;

      const stage = stages[index];
      this.logger.warn(
        `Matches request failed for "${stage.championship.name}" ` +
          `(${createMatchesUrl(
            stage.championship.externalId,
            stage.externalId,
          )}): ${getErrorMessage(result.reason)}`,
      );
    });

    return {
      matches: results.flatMap((result) =>
        result.status === 'fulfilled' ? result.value : [],
      ),
      isComplete: results.every((result) => result.status === 'fulfilled'),
    };
  }

  async fetchMatchAttackStatistics(
    matches: MatchEntity[],
  ): Promise<PromiseSettledResult<IFetchedMatchAttackStatistics>[]> {
    return this.mapSettled({
      items: matches,
      mapper: async (match) => {
        if (!match.externalId) {
          throw new Error(`CEV match ${match.id} has no external ID`);
        }
        const html = await this.getMatchStatisticsHtml(match.externalId);

        return {
          matchExternalId: match.externalId,
          home: extractPlayerAttackStatistics(html, 'casa'),
          away: extractPlayerAttackStatistics(html, 'ospiti'),
        };
      },
      concurrency: CEV_HTTP_CONCURRENCY,
    });
  }

  async fetchMatchRosters(
    matches: MatchEntity[],
  ): Promise<PromiseSettledResult<IFetchedMatchRoster>[]> {
    const results = await this.mapSettled({
      items: matches,
      mapper: async (match) => {
        if (!match.externalId) {
          throw new Error(`CEV match ${match.id} has no external ID`);
        }
        const html = await this.http.get(
          createMatchPageUrl(
            match.league.stage.championship.externalId,
            match.league.externalId,
            match.externalId,
          ),
        );

        return {
          matchExternalId: match.externalId,
          home: extractMatchRoster(html, 'home'),
          away: extractMatchRoster(html, 'guest'),
        };
      },
      concurrency: CEV_HTTP_CONCURRENCY,
    });

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Match roster request failed for ${matches[index].externalId}: ` +
            getErrorMessage(result.reason),
        );
      }
    });

    return results;
  }

  async fetchMatchLineups(
    matches: MatchEntity[],
  ): Promise<PromiseSettledResult<IFetchedMatchLineup>[]> {
    const results = await this.mapSettled({
      items: matches,
      mapper: async (match) => {
        if (!match.externalId) {
          throw new Error(`CEV match ${match.id} has no external ID`);
        }
        const html = await this.http.get(
          createMatchStatisticsUrl(match.externalId),
        );

        return {
          matchExternalId: match.externalId,
          home: extractMatchLineup(html, 'casa'),
          away: extractMatchLineup(html, 'ospiti'),
        };
      },
      concurrency: CEV_HTTP_CONCURRENCY,
    });

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Match lineup request failed for ${matches[index].externalId}: ` +
            getErrorMessage(result.reason),
        );
      }
    });

    return results;
  }

  private fetchCalendarYear(
    initialHtml: string,
    year: number,
  ): Promise<string> {
    const form = createCalendarForm(initialHtml, year);

    return this.http.postForm(CEV_CALENDAR_URL, form);
  }

  private async getMatchStatisticsHtml(
    matchExternalId: string,
  ): Promise<string> {
    const cached = this.matchStatisticsCache.get(matchExternalId);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.html;
    }

    const html = await this.http.get(createMatchStatisticsUrl(matchExternalId));
    this.setCachedHtml(this.matchStatisticsCache, matchExternalId, {
      html,
      expiresAt: Date.now() + 5 * 60_000,
    });

    return html;
  }

  private async getTeamDetailsHtml(
    teamExternalId: string,
    championshipExternalId: number,
  ): Promise<string> {
    const key = createTeamDetailsKey(teamExternalId, championshipExternalId);
    const cached = this.teamDetailsCache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.html;
    }

    const pending = this.teamDetailsRequests.get(key);
    if (pending) return pending;

    const request = this.http
      .get(createTeamDetailsUrl(teamExternalId, championshipExternalId))
      .then((html) => {
        this.setCachedHtml(this.teamDetailsCache, key, {
          html,
          expiresAt: Date.now() + 5 * 60_000,
        });
        return html;
      })
      .finally(() => this.teamDetailsRequests.delete(key));
    this.teamDetailsRequests.set(key, request);

    return request;
  }

  private fetchNationalTeamCalendar(initialHtml: string): Promise<string> {
    const form = createNationalTeamCalendarForm(initialHtml);

    return this.http.postForm(CEV_CALENDAR_URL, form);
  }

  private setCachedHtml(
    cache: Map<string, { html: string; expiresAt: number }>,
    key: string,
    value: { html: string; expiresAt: number },
  ): void {
    const now = Date.now();

    for (const [cachedKey, cached] of cache) {
      if (cached.expiresAt <= now) {
        cache.delete(cachedKey);
      }
    }

    while (cache.size >= CEV_HTML_CACHE_MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey === undefined) break;
      cache.delete(oldestKey);
    }

    cache.set(key, value);
  }

  private async mapSettled<TInput, TOutput>(
    data: IMapSettledParams<TInput, TOutput>,
  ): Promise<PromiseSettledResult<TOutput>[]> {
    const { items, mapper, concurrency } = data;
    const results = new Array<PromiseSettledResult<TOutput>>(items.length);
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++;

        try {
          results[index] = {
            status: 'fulfilled',
            value: await mapper(items[index]),
          };
        } catch (reason: unknown) {
          results[index] = { status: 'rejected', reason };
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, worker),
    );

    return results;
  }
}

function createTeamDetailsKey(
  teamExternalId: string,
  championshipExternalId: number,
): string {
  return `${teamExternalId}:${championshipExternalId}`;
}

function getMatchStatisticsPlayers(
  lineup: IFetchedMatchLineup['home'],
  roster: IFetchedMatchRoster['home'],
): IFetchedMatchRoster['home'] {
  const playerNames = new Set(
    lineup.map(({ playerName }) => normalizePlayerName(playerName)),
  );
  const shirtNumbers = new Set(
    lineup.flatMap(({ shirtNumber }) =>
      shirtNumber === null ? [] : [shirtNumber],
    ),
  );

  return roster.filter(
    ({ playerName, shirtNumber }) =>
      playerNames.has(normalizePlayerName(playerName)) ||
      (shirtNumber !== null && shirtNumbers.has(shirtNumber)),
  );
}
