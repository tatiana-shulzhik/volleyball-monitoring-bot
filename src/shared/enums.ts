export enum EMatchStatus {
  Scheduled = 'scheduled',
  Finished = 'finished',
  Cancelled = 'cancelled',
}

export enum ECronExpression {
  EveryHourAtMinute10 = '10 * * * *',
  Every3HoursAtMinute30 = '30 */3 * * *',
}
