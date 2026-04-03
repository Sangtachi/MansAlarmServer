function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local calendar date as YYYY-MM-DD (browser locale calendar). */
export function formatLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Tomorrow relative to "today" in the user's local calendar. */
export function tomorrowYmd(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return formatLocalYmd(t);
}

/** Lexicographic compare for YYYY-MM-DD strings. */
export function compareYmd(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
