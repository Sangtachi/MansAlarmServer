/** Returns normalized URL or null if empty; null if invalid scheme. */
export function normalizeRewardUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) {
    return null;
  }
  try {
    const u = new URL(s);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      return u.toString();
    }
  } catch {
    return null;
  }
  return null;
}
