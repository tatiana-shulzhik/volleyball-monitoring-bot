import { Injectable } from '@nestjs/common';
import { LessThan } from 'typeorm';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import { ECompetitionType, ESourceCode } from '../../shared/enums';

@Injectable()
export class TelegramStatisticsQueryService {
  constructor(
    private readonly seasonsRepository: SeasonsRepository,
    private readonly championshipsRepository: ChampionshipsRepository,
    private readonly stagesRepository: CompetitionStagesRepository,
    private readonly teamLeaguesRepository: TeamLeaguesRepository,
  ) {}

  async findCurrentSeasons(
    competitionType: ECompetitionType,
    sourceCode: ESourceCode,
  ): Promise<SeasonsEntity[]> {
    const season = await this.findCurrentSeason(competitionType, sourceCode);

    return season ? [season] : [];
  }

  async findFinishedSeasons(
    competitionType: ECompetitionType,
    sourceCode: ESourceCode,
  ): Promise<SeasonsEntity[]> {
    const [currentSeason, finishedSeasons] = await Promise.all([
      this.findCurrentSeason(competitionType, sourceCode),
      this.seasonsRepository.findFinished(
        new Date(),
        competitionType,
        sourceCode,
      ),
    ]);

    return finishedSeasons
      .filter(({ id }) => id !== currentSeason?.id)
      .slice(0, PREVIOUS_YEARS_COUNT);
  }

  async findRecentSeasons(
    competitionType: ECompetitionType,
    sourceCode: ESourceCode,
  ): Promise<SeasonsEntity[]> {
    const seasons = await this.seasonsRepository.getWhere({
      stages: {
        championship: { competitionType, source: { code: sourceCode } },
      },
    });

    return seasons
      .sort((left, right) => right.name.localeCompare(left.name))
      .slice(0, PREVIOUS_YEARS_COUNT);
  }

  async findChampionships(
    competitionType: ECompetitionType,
    sourceCode: ESourceCode,
    seasonId?: number,
  ): Promise<ChampionshipsEntity[]> {
    const selectedSeasonId =
      seasonId ??
      (await this.findCurrentSeason(competitionType, sourceCode))?.id;

    if (selectedSeasonId === undefined) {
      return [];
    }

    const championships = await this.championshipsRepository.getWhere({
      competitionType,
      source: { code: sourceCode },
      stages: {
        season: { id: selectedSeasonId },
        ...(seasonId === undefined ? {} : { endsAt: LessThan(new Date()) }),
      },
    });

    return championships.sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  async findStages(
    championshipId: number,
    competitionType: ECompetitionType,
    sourceCode: ESourceCode,
    seasonId?: number,
  ): Promise<CompetitionStagesEntity[]> {
    const selectedSeasonId =
      seasonId ??
      (await this.findCurrentSeason(competitionType, sourceCode))?.id;

    if (selectedSeasonId === undefined) {
      return [];
    }

    const stages = await this.stagesRepository.getWhere({
      championship: { id: championshipId, source: { code: sourceCode } },
      season: { id: selectedSeasonId },
    });

    return stages.sort((left, right) => left.name.localeCompare(right.name));
  }

  async findTeamsForStage(
    stageId: number,
  ): Promise<{ team: TeamEntity; leagueId: number }[]> {
    const relations = await this.teamLeaguesRepository.getWhere({
      league: { stage: { id: stageId } },
    });

    const uniqueTeams = new Map(
      relations.map(({ team, league }) => [
        team.name.trim().toLowerCase(),
        { team, leagueId: league.id },
      ]),
    );

    return [...uniqueTeams.values()].sort((left, right) =>
      left.team.name.localeCompare(right.team.name),
    );
  }

  private findCurrentSeason(
    competitionType: ECompetitionType,
    sourceCode: ESourceCode,
  ): Promise<SeasonsEntity | null> {
    return this.seasonsRepository.findLatestWithActiveMatches(
      new Date(),
      competitionType,
      sourceCode,
    );
  }
}
