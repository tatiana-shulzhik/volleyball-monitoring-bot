import {
  ICevMatchRosterPlayer,
  ICevPlayerAttackStatistics,
} from '../interfaces/requests/player-statistics.interface';

const TABLE_CELL = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;

export function extractPlayerAttackStatistics(
  html: string,
  side: 'casa' | 'ospiti',
): ICevPlayerAttackStatistics[] {
  const values = new Map<
    number,
    Partial<ICevPlayerAttackStatistics> & {
      successfulPercentage?: number;
      playedSets?: Set<number>;
    }
  >();
  const field =
    /id=["']GV_elenco_(casa|ospiti|fuori)_L_(Nome|PointsTot|PosSet[1-5]|SpikeTot|SpikePos0?)_(\d+)["'][^>]*>([\s\S]*?)</gi;

  for (const match of html.matchAll(field)) {
    const sourceSide =
      match[1].toLowerCase() === 'fuori' ? 'ospiti' : match[1].toLowerCase();

    if (sourceSide !== side) {
      continue;
    }

    const index = Number(match[3]);
    const row = values.get(index) ?? {};
    const value = cleanText(match[4]);

    if (match[2] === 'Nome') {
      row.playerName = value;
    } else if (match[2] === 'PointsTot') {
      row.points = parseInteger(value) ?? 0;
    } else if (match[2].startsWith('PosSet')) {
      if (value && value !== '-') {
        const setNumber = Number(match[2].slice(-1));
        row.playedSets = row.playedSets ?? new Set<number>();
        row.playedSets.add(setNumber);
      }
    } else if (match[2] === 'SpikeTot') {
      row.attempts = parseInteger(value) ?? 0;
    } else if (match[2] === 'SpikePos0') {
      const successful = parseInteger(value);

      if (successful !== null) {
        row.successful = successful;
      }
    } else {
      const successfulPercentage = parseInteger(value);

      if (successfulPercentage !== null) {
        row.successfulPercentage = successfulPercentage;
      }
    }

    values.set(index, row);
  }

  const sourceSide = side === 'ospiti' ? '(?:ospiti|fuori)' : 'casa';
  const rows = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const nameField = new RegExp(
    `id=["']GV_elenco_${sourceSide}_L_Nome_(\\d+)["'][^>]*>` +
      `([\\s\\S]*?)<\\/`,
    'i',
  );

  for (const match of html.matchAll(rows)) {
    const name = match[1].match(nameField);

    if (!name) {
      continue;
    }

    const cells = [...match[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (cell) => cleanText(cell[1]),
    );
    const playedSets = cells
      .slice(2, 7)
      .filter((value) => value === '*' || /^\d+$/.test(value)).length;

    if (playedSets) {
      const row = values.get(Number(name[1]));

      if (row) {
        row.playedSets = new Set(
          Array.from({ length: playedSets }, (_, index) => index + 1),
        );
      }
    }
  }

  return [...values.values()].flatMap((row) => {
    if (!row.playerName || row.attempts === undefined) {
      return [];
    }

    const successful =
      row.successful ??
      Math.round((row.attempts * (row.successfulPercentage ?? 0)) / 100);
    return [
      {
        playerName: row.playerName,
        attempts: row.attempts,
        successful,
        points: row.points ?? 0,
        setsPlayed: row.playedSets?.size ?? 0,
      },
    ];
  });
}

export function extractMatchRoster(
  html: string,
  side: 'home' | 'guest',
): ICevMatchRosterPlayer[] {
  const gridName = side === 'home' ? 'Home' : 'Guest';
  const rowPattern = new RegExp(
    `<tr\\b[^>]*id=["'][^"']*RG_Roster${gridName}[^"']*["'][^>]*>` +
      `([\\s\\S]*?)<\\/tr>`,
    'gi',
  );
  const players = new Map<string, ICevMatchRosterPlayer>();

  for (const row of html.matchAll(rowPattern)) {
    const player = row[1].match(
      /<a\b(?=[^>]*href=["'][^"']*PlayerDetails\.aspx\?[^"']*PlayerID=(\d+))[^>]*>([\s\S]*?)<\/a>/i,
    );

    if (!player) {
      continue;
    }

    const linkText = cleanText(player[2]);
    const details = linkText.match(/^(\d+)\s+(.+)$/);
    const cells = [...row[1].matchAll(TABLE_CELL)].map((match) =>
      cleanText(match[1]),
    );
    const shirtNumber = details
      ? Number(details[1])
      : parseInteger(cells.find((cell) => /^\d+$/.test(cell)));
    const playerName = details?.[2] ?? linkText;

    if (!playerName) {
      continue;
    }

    players.set(player[1], {
      externalId: player[1],
      playerName,
      shirtNumber,
    });
  }

  return [...players.values()];
}

function parseInteger(value: string | undefined): number | null {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function cleanText(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
