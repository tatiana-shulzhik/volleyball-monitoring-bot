const CEV_CITY_TIME_ZONE_OVERRIDES: Readonly<Record<string, string>> = {
  ALBA: 'Europe/Bucharest',
  DEBICA: 'Europe/Warsaw',
  HELSINKI: 'Europe/Helsinki',
  'LA LAGUNA': 'Atlantic/Canary',
  KÄÄRIKU: 'Europe/Tallinn',
  'LAS PALMAS': 'Atlantic/Canary',
  MARIBOR: 'Europe/Ljubljana',
  NICOSIA: 'Asia/Nicosia',
  NOKIA: 'Europe/Helsinki',
  ODENSE: 'Europe/Copenhagen',
  POPRAD: 'Europe/Bratislava',
  RIGA: 'Europe/Riga',
  SERRAVALLE: 'Europe/San_Marino',
  STEINBRUNN: 'Europe/Vienna',
  STRUMICA: 'Europe/Skopje',
  TENERIFE: 'Atlantic/Canary',
  TIRANA: 'Europe/Tirane',
  YEREVAN: 'Asia/Yerevan',
};

export const CEV_COUNTRY_TIME_ZONES: Readonly<Record<string, string>> = {
  AND: 'Europe/Andorra',
  ALB: 'Europe/Tirane',
  ARM: 'Asia/Yerevan',
  AUT: 'Europe/Vienna',
  AZE: 'Asia/Baku',
  BEL: 'Europe/Brussels',
  BIH: 'Europe/Sarajevo',
  BLR: 'Europe/Minsk',
  BUL: 'Europe/Sofia',
  CRO: 'Europe/Zagreb',
  CYP: 'Asia/Nicosia',
  CZE: 'Europe/Prague',
  DEN: 'Europe/Copenhagen',
  ENG: 'Europe/London',
  ESP: 'Europe/Madrid',
  EST: 'Europe/Tallinn',
  FAR: 'Atlantic/Faroe',
  FIN: 'Europe/Helsinki',
  FRA: 'Europe/Paris',
  GEO: 'Asia/Tbilisi',
  GER: 'Europe/Berlin',
  GRE: 'Europe/Athens',
  HUN: 'Europe/Budapest',
  IRL: 'Europe/Dublin',
  ISL: 'Atlantic/Reykjavik',
  ISR: 'Asia/Jerusalem',
  ITA: 'Europe/Rome',
  KOS: 'Europe/Belgrade',
  LAT: 'Europe/Riga',
  LIE: 'Europe/Zurich',
  LTU: 'Europe/Vilnius',
  LUX: 'Europe/Luxembourg',
  MDA: 'Europe/Chisinau',
  MKD: 'Europe/Skopje',
  MLT: 'Europe/Malta',
  MNE: 'Europe/Podgorica',
  NED: 'Europe/Amsterdam',
  NIR: 'Europe/London',
  NOR: 'Europe/Oslo',
  POL: 'Europe/Warsaw',
  POR: 'Europe/Lisbon',
  ROU: 'Europe/Bucharest',
  RUS: 'Europe/Moscow',
  SCO: 'Europe/London',
  SMR: 'Europe/San_Marino',
  SRB: 'Europe/Belgrade',
  SLO: 'Europe/Ljubljana',
  SUI: 'Europe/Zurich',
  SVK: 'Europe/Bratislava',
  SWE: 'Europe/Stockholm',
  TUR: 'Europe/Istanbul',
  UKR: 'Europe/Kyiv',
  WAL: 'Europe/London',
};

export function resolveCevVenueTimeZone(
  venue: string,
  countryCode?: string,
): string {
  const normalizedVenue = normalize(venue);
  const cityTimeZone = Object.entries(CEV_CITY_TIME_ZONE_OVERRIDES).reduce<
    readonly [normalizedCity: string, timeZone: string] | undefined
  >((bestMatch, [city, timeZone]) => {
    const normalizedCity = normalize(city);
    if (!normalizedVenue.includes(normalizedCity)) return bestMatch;

    return !bestMatch || normalizedCity.length > bestMatch[0].length
      ? [normalizedCity, timeZone]
      : bestMatch;
  }, undefined)?.[1];
  const countryTimeZone = countryCode
    ? CEV_COUNTRY_TIME_ZONES[countryCode]
    : undefined;
  const timeZone = cityTimeZone ?? countryTimeZone;

  if (!timeZone) {
    throw new Error(
      `Unknown CEV venue timezone: ${venue || '(empty venue)'}, ` +
        `country=${countryCode ?? '(unknown)'}. ` +
        `Add mapping: ['CITY', 'IANA_TIME_ZONE']`,
    );
  }

  return timeZone;
}

export function parseCevLocalDate(
  value: string,
  timeZone: string,
): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/);

  if (!match) return null;

  const [, day, month, year, hours, minutes] = match.map(Number);
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hours > 23 ||
    minutes > 59
  ) {
    return null;
  }

  const localAsUtc = Date.UTC(year, month - 1, day, hours, minutes);
  const initialDate = new Date(localAsUtc);
  const initialOffset = getTimeZoneOffset(initialDate, timeZone);
  const instant = new Date(localAsUtc - initialOffset);
  const resolvedOffset = getTimeZoneOffset(instant, timeZone);

  return new Date(localAsUtc - resolvedOffset);
}

function getTimeZoneOffset(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return (
    Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      value('hour'),
      value('minute'),
      value('second'),
    ) - date.getTime()
  );
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[Łł]/g, 'L')
    .replace(/[Øø]/g, 'O')
    .replace(/[ĐđÐð]/g, 'D')
    .replace(/[Ææ]/g, 'AE')
    .replace(/[Œœ]/g, 'OE')
    .toLocaleUpperCase('en-US');
}
