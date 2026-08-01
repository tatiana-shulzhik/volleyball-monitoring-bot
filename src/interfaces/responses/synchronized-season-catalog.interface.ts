import { ChampionshipsEntity } from '../../databases/entities/championships.entity';
import { SeasonsEntity } from '../../databases/entities/seasons.entity';
import { ICevCompetitionStage } from '../requests/competition-stages.interface';

export interface SynchronizedSeasonCatalog {
  championships: ChampionshipsEntity[];
  calendarStages: ICevCompetitionStage[];
  seasons: SeasonsEntity[];
}
