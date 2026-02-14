/** Returns the current ISO week key as "YYYY-W##" (e.g. "2026-W07") */
export function getCurrentWeekKey(): string {
  const now = new Date();
  // ISO week calculation: week starts on Monday
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  // Set to nearest Thursday (ISO weeks are defined by Thursday)
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Convert a week key string to a numeric seed */
export function weekKeyToSeed(weekKey: string): number {
  let hash = 0;
  for (let i = 0; i < weekKey.length; i++) {
    hash = ((hash << 5) - hash + weekKey.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // ensure unsigned 32-bit
}
