import { uniqueBy } from './array.utils';
import { ITeamLeaguePairsQuery } from '../interfaces/requests/team-league-pairs-query.interface';

export function createTeamLeaguePairsQuery(
  pairs: Array<{ teamId: number; leagueId: number }>,
): ITeamLeaguePairsQuery | null {
  const uniquePairs = uniqueBy(
    pairs,
    ({ teamId, leagueId }) => `${teamId}:${leagueId}`,
  );
  if (!uniquePairs.length) return null;

  const parameters = Object.fromEntries(
    uniquePairs.flatMap(({ teamId, leagueId }, index) => [
      [`teamId${index}`, teamId],
      [`leagueId${index}`, leagueId],
    ]),
  );
  const values = uniquePairs
    .map((_, index) => `(:teamId${index}, :leagueId${index})`)
    .join(', ');

  return {
    condition: `(relation.team_id, relation.league_id) IN (${values})`,
    parameters,
  };
}
