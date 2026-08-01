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
import { ECompetitionType } from '../../shared/enums';

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
  ): Promise<SeasonsEntity[]> {
    const season = await this.findCurrentSeason(competitionType);

    return season ? [season] : [];
  }

  async findFinishedSeasons(
    competitionType: ECompetitionType,
  ): Promise<SeasonsEntity[]> {
    const [currentSeason, finishedSeasons] = await Promise.all([
      this.findCurrentSeason(competitionType),
      this.seasonsRepository.findFinished(new Date(), competitionType),
    ]);

    return finishedSeasons
      .filter(({ id }) => id !== currentSeason?.id)
      .slice(0, PREVIOUS_YEARS_COUNT);
  }

  async findChampionships(
    competitionType: ECompetitionType,
    seasonId?: number,
  ): Promise<ChampionshipsEntity[]> {
    const selectedSeasonId =
      seasonId ?? (await this.findCurrentSeason(competitionType))?.id;

    if (selectedSeasonId === undefined) {
      return [];
    }

    const championships = await this.championshipsRepository.getWhere({
      competitionType,
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
    seasonId?: number,
  ): Promise<CompetitionStagesEntity[]> {
    const selectedSeasonId =
      seasonId ?? (await this.findCurrentSeason(competitionType))?.id;

    if (selectedSeasonId === undefined) {
      return [];
    }

    const stages = await this.stagesRepository.getWhere({
      championship: { id: championshipId },
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
  ): Promise<SeasonsEntity | null> {
    return this.seasonsRepository.findLatestWithActiveMatches(
      new Date(),
      competitionType,
    );
  }
}
