import { Injectable } from '@nestjs/common';
import { LessThan } from 'typeorm';
import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { CompetitionStagesEntity } from '../../databases/entities/competition-stages.entity';
import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { ChampionshipsRepository } from '../../databases/repositories/championships.repository';
import { CompetitionStagesRepository } from '../../databases/repositories/competition-stages.repository';
import { LeaguesRepository } from '../../databases/repositories/leagues.repository';
import { SeasonsRepository } from '../../databases/repositories/seasons.repository';
import { TeamLeaguesRepository } from '../../databases/repositories/team-leagues.repository';
import { PREVIOUS_YEARS_COUNT } from '../../shared/consts/constants';
import { ECompetitionType } from '../../shared/enums';
import { getSeasonName } from '../../shared/season.utils';

@Injectable()
export class TelegramStatisticsQueryService {
  constructor(
    private readonly seasonsRepository: SeasonsRepository,
    private readonly championshipsRepository: ChampionshipsRepository,
    private readonly stagesRepository: CompetitionStagesRepository,
    private readonly leaguesRepository: LeaguesRepository,
    private readonly teamLeaguesRepository: TeamLeaguesRepository,
  ) {}

  findCurrentSeasons(
    competitionType: ECompetitionType,
  ): Promise<SeasonsEntity[]> {
    return this.seasonsRepository.getWhere({
      name: this.getCurrentSeasonName(competitionType),
      stages: { championship: { competitionType } },
    });
  }

  async findFinishedSeasons(
    competitionType: ECompetitionType,
  ): Promise<SeasonsEntity[]> {
    return (
      await this.seasonsRepository.findFinished(new Date(), competitionType)
    ).slice(0, PREVIOUS_YEARS_COUNT);
  }

  async findChampionships(
    competitionType: ECompetitionType,
    seasonId?: number,
  ): Promise<ChampionshipsEntity[]> {
    const championships = await this.championshipsRepository.getWhere({
      competitionType,
      stages:
        seasonId === undefined
          ? { season: { name: this.getCurrentSeasonName(competitionType) } }
          : { season: { id: seasonId }, endsAt: LessThan(new Date()) },
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
    const stages = await this.stagesRepository.getWhere({
      championship: { id: championshipId },
      season:
        seasonId === undefined
          ? { name: this.getCurrentSeasonName(competitionType) }
          : { id: seasonId },
    });

    return stages.sort((left, right) => left.name.localeCompare(right.name));
  }

  async findLeagues(stageId: number): Promise<LeaguesEntity[]> {
    const leagues = await this.leaguesRepository.getWhere({
      stage: { id: stageId },
    });

    return leagues.sort((left, right) => left.name.localeCompare(right.name));
  }

  async findTeams(leagueId: number): Promise<TeamEntity[]> {
    const relations = await this.teamLeaguesRepository.getWhere({
      league: { id: leagueId },
    });

    return relations
      .map(({ team }) => team)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private getCurrentSeasonName(competitionType: ECompetitionType): string {
    return competitionType === ECompetitionType.Club
      ? getSeasonName(new Date())
      : String(new Date().getFullYear());
  }
}
