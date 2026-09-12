import {
  ELivePlayerMonitoringStatus,
  ERosterMonitoringStatus,
  EStartingLineupMonitoringStatus,
} from '../../shared/enums';
import { MatchEntity } from '../../databases/entities/match.entity';
import { MonitoringSubscriptionEntity } from '../../databases/entities/monitoring-subscription.entity';
import { PlayerTeamLeagueEntity } from '../../databases/entities/player-team-league.entity';

/** Последнее состояние игрока, сохранённое для конкретного матча. */
export interface IPlayerMonitoringState {
  rosterStatus?: ERosterMonitoringStatus;
  startingStatus?: EStartingLineupMonitoringStatus;
  liveStatus?: ELivePlayerMonitoringStatus;
}

export interface IPlayerMonitoringMessageData {
  playerName: string;
  shirtNumber: number | null;
  position: string | null;
  teamName: string;
  homeTeamName: string;
  awayTeamName: string;
}

export interface IMonitoringContext {
  matches: MatchEntity[];
  subscriptionsByChampionship: Map<number, MonitoringSubscriptionEntity[]>;
  relationsByPlayerAndLeague: Map<string, PlayerTeamLeagueEntity>;
}

export interface IMonitoredPlayer<T> {
  subscription: MonitoringSubscriptionEntity;
  relation: PlayerTeamLeagueEntity;
  teamData: T;
}
