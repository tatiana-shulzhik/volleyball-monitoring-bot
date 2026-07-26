import { PlayerTeamSeasonEntity } from '../../databases/entities/player-team-season.entity';
import { PlayersEntity } from '../../databases/entities/players.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { TeamEntity } from '../../databases/entities/team.entity';
import { EntityChanges } from '../responses/entity-changes.interface';
import { RelationChanges } from '../responses/relation-changes.interface';

export interface ICevPlayer {
  externalId: string;
  fullName: string;
  position: string;
  teamExternalId: string;
  seasonExternalId: number;
}

export interface FetchedPlayers {
  players: ICevPlayer[];
  isComplete: boolean;
}

export interface ExtractPlayersParams {
  html: string;
  teamExternalId: string;
  seasonExternalId: number;
}

export interface CalculatePlayerChangesParams {
  incoming: ICevPlayer[];
  existing: PlayersEntity[];
}

export interface CalculatePlayerRelationChangesParams {
  incoming: ICevPlayer[];
  existing: PlayerTeamSeasonEntity[];
  playersByExternalId: Map<string, PlayersEntity>;
  teamsByExternalId: Map<string, TeamEntity>;
  seasonsByExternalId: Map<number, SeasonsEntity>;
}

export type PlayerChanges = EntityChanges<
  PlayersEntity,
  Omit<PlayersEntity, 'id'>
>;

export type PlayerRelationChanges = RelationChanges<
  Omit<PlayerTeamSeasonEntity, 'id'>
>;
