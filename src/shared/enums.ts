export enum EMatchStatus {
  Scheduled = 'scheduled',
  Finished = 'finished',
  Cancelled = 'cancelled',
}

export enum ECronExpression {
  EveryHourAtMinute10 = '10 * * * *',
  Every3HoursAtMinute30 = '30 */3 * * *',
}

export enum ECompetitionType {
  Club = 'club',
  NationalTeam = 'national_team',
}

export enum ESourceCode {
  Cev = 'cev',
  LegaVolley = 'legavolley',
  LegaVolleyFemminile = 'legavolley_femminile',
}
