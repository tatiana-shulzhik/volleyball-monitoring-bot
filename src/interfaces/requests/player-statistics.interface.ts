import type { PlayerTeamLeagueEntity } from '../../databases/entities/player-team-league.entity';

export interface ICevPlayerAttackStatistics {
  playerName: string;
  attempts: number;
  successful: number;
  points: number;
  setsPlayed: number;
}

export interface ICevMatchRosterPlayer {
  externalId: string;
  playerName: string;
  shirtNumber: number | null;
}

export interface IFetchedMatchRoster {
  matchExternalId: string;
  home: ICevMatchRosterPlayer[];
  away: ICevMatchRosterPlayer[];
}

export interface ICevMatchLineupPlayer {
  playerName: string;
  shirtNumber: number | null;
  setMarks: string[];
}

export interface IFetchedMatchLineup {
  matchExternalId: string;
  home: ICevMatchLineupPlayer[];
  away: ICevMatchLineupPlayer[];
}

export interface IFetchedMatchAttackStatistics {
  matchExternalId: string;
  home: ICevPlayerAttackStatistics[];
  away: ICevPlayerAttackStatistics[];
}

export type PlayerRelation = PlayerTeamLeagueEntity;

export interface IPlayerRelationMaps {
  byExactPlayer: Map<string, PlayerRelation>;
}
