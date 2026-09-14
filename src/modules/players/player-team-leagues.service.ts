import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { MatchEntity } from '../../databases/entities/match.entity';
import { PlayerTeamLeagueEntity } from '../../databases/entities/player-team-league.entity';
import { PlayerTeamLeaguesRepository } from '../../databases/repositories/player-team-leagues.repository';

@Injectable()
export class PlayerTeamLeaguesService {
  constructor(private readonly repository: PlayerTeamLeaguesRepository) {}

  async getMatchRosters(match: MatchEntity): Promise<{
    home: PlayerTeamLeagueEntity[];
    away: PlayerTeamLeagueEntity[];
  }> {
    const roster = await this.repository.getWhere({
      league: { id: match.league.id },
      team: { id: In([match.homeTeam.id, match.awayTeam.id]) },
    });
    const matchTeamIds = new Set([match.homeTeam.id, match.awayTeam.id]);
    const matchRoster = roster.filter(
      ({ league, team }) =>
        league.id === match.league.id &&
        league.stage.championship.id === match.league.stage.championship.id &&
        matchTeamIds.has(team.id),
    );

    return {
      home: matchRoster.filter(({ team }) => team.id === match.homeTeam.id),
      away: matchRoster.filter(({ team }) => team.id === match.awayTeam.id),
    };
  }
}
