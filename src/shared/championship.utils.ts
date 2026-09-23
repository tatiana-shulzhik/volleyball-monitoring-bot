export function extractChampionshipAgeCategory(
  championshipName: string,
): number | null {
  const match = championshipName.match(/\b(?:U|UNDER)[\s-]?(\d{1,2})\b/i);

  return match ? Number(match[1]) : null;
}

export function hasSameChampionshipAgeCategory(
  leftChampionshipName: string,
  rightChampionshipName: string,
): boolean {
  return (
    extractChampionshipAgeCategory(leftChampionshipName) ===
    extractChampionshipAgeCategory(rightChampionshipName)
  );
}
