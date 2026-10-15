/** Строка выборки состава команды из SQL-запроса. */
export interface TeamRosterRow {
  teamName: string;
  playerId: number | null;
  playerFullName: string | null;
  shirtNumber: number | null;
}

/** Игрок состава команды в конкретной лиге. */
export interface TeamRosterPlayer {
  id: number;
  fullName: string;
  shirtNumber: number | null;
}
