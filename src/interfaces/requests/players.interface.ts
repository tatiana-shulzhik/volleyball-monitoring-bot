import { LeaguesEntity } from '../../databases/entities/leagues.entity';
import { PlayerTeamLeagueEntity } from '../../databases/entities/player-team-league.entity';
import { PlayersEntity } from '../../databases/entities/players.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { EntityChanges } from '../responses/entity-changes.interface';
import { IRelationChanges } from '../responses/relation-changes.interface';

export interface ICevPlayer {
  externalId: string;
  fullName: string;
  position: string;
  shirtNumber: number | null;
  teamExternalId: string;
  leagueExternalId: number;
}

export interface IFetchedPlayers {
  players: ICevPlayer[];
  isComplete: boolean;
}

export interface IExtractPlayersParams {
  html: string;
  teamExternalId: string;
  leagueExternalId: number;
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

export type PlayerChanges = EntityChanges<
  PlayersEntity,
  Omit<PlayersEntity, 'id'>
>;

export type PlayerRelationChanges = IRelationChanges<
  Omit<PlayerTeamLeagueEntity, 'id'>
>;
