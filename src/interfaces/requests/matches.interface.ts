import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { MatchEntity } from '../../databases/entities/match.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { EMatchStatus } from '../../shared/enums';
import { EntityChanges } from '../responses/entity-changes.interface';

export interface ICevMatch {
  externalId: string;
  leagueExternalId: number;
  homeTeamExternalId: string;
  awayTeamExternalId: string;
  scheduledAt: Date | null;
  status: EMatchStatus;
}

export interface IFetchedMatches {
  matches: ICevMatch[];
  isComplete: boolean;
}

export interface ICalculateMatchChangesParams {
  incoming: ICevMatch[];
  existing: MatchEntity[];
  leaguesByExternalId: Map<number, LeaguesEntity>;
  teamsByExternalId: Map<string, TeamEntity>;
}

export type MatchChanges = EntityChanges<MatchEntity, Omit<MatchEntity, 'id'>>;
