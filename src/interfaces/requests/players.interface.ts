import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { PlayerTeamLeagueEntity } from '../../databases/entities/player-team-league.entity';
import { PlayersEntity } from '../../databases/entities/players.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { ECompetitionType, ESourceCode } from '../../shared/enums';
import { EntityChanges } from '../responses/entity-changes.interface';
import { IRelationChanges } from '../responses/relation-changes.interface';
import { ILegaPlayer } from './lega-volley.interface';

export interface ICevPlayer {
  externalId: string;
  fullName: string;
  position: string;
  shirtNumber: number | null;
  birthYear: number | null;
  teamExternalId: string;
  leagueExternalId: number;
}

export interface IFetchedPlayers {
  players: ICevPlayer[];
  teamCountries: Array<{ teamExternalId: string; country: string }>;
  isComplete: boolean;
}

export interface ICalculatePlayerChangesParams {
  incoming: ICevPlayer[];
  existing: PlayersEntity[];
}

export interface ICalculatePlayerRelationChangesParams {
  incoming: ICevPlayer[];
  existing: PlayerTeamLeagueEntity[];
  playersByExternalId: Map<string, PlayersEntity>;
  teamsByExternalId: Map<string, TeamEntity>;
  leaguesByExternalId: Map<number, LeaguesEntity>;
}

export interface IFindEquivalentTeamDataParams {
  team: TeamEntity;
  sourceCode: ESourceCode;
  competitionType: ECompetitionType;
  championshipName: string;
}

export interface IUpsertCatalogPlayersParams {
  incomingPlayers: ILegaPlayer[];
  teamsByExternalId: Map<string, TeamEntity>;
  leaguesByExternalId: Map<number, LeaguesEntity>;
  sourceCode: ESourceCode;
  preserveStoredNames?: boolean;
  removeObsoleteRelations?: boolean;
  relationScopes?: Array<{ team: TeamEntity; league: LeaguesEntity }>;
}

export interface IFindTeamStatisticsParams {
  teamId: number;
  leagueId: number;
  aggregateSeasons?: Array<{ id: number; name: string }>;
  includeHistoricalRoster?: boolean;
}

export type PlayerChanges = EntityChanges<
  PlayersEntity,
  Omit<PlayersEntity, 'id'>
>;

export type PlayerRelationChanges = IRelationChanges<
  Omit<PlayerTeamLeagueEntity, 'id'>
>;
