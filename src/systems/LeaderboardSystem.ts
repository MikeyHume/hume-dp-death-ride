const STORAGE_KEY = 'dp-moto-leaderboard';
const MAX_ENTRIES = 100;
const DISPLAY_ENTRIES = 10;

export interface LeaderboardEntry {
  name: string;
  score: number;
  time: number; // seconds survived
  date: string; // ISO timestamp
}

interface LeaderboardData {
  [weekKey: string]: LeaderboardEntry[];
}

export class LeaderboardSystem {
  private weekKey: string;
  private data: LeaderboardData;

  constructor(weekKey: string) {
    this.weekKey = weekKey;
    this.data = this.load();
  }

  /** Check if a score would make the top 10 display. Returns potential rank (1-based) or 0. */
  wouldMakeBoard(score: number): number {
    const entries = this.data[this.weekKey] || [];
    const top = entries.slice(0, DISPLAY_ENTRIES);
    if (top.length < DISPLAY_ENTRIES) {
      let rank = 1;
      for (let i = 0; i < top.length; i++) {
        if (score <= top[i].score) rank = i + 2;
      }
      return rank;
    }
    const lowest = top[top.length - 1];
    if (score > lowest.score) {
      let rank = 1;
      for (let i = 0; i < top.length; i++) {
        if (score <= top[i].score) rank = i + 2;
      }
      return rank;
    }
    return 0;
  }

  /** Submit a score with a name. Returns the rank (1-based) or 0 if it didn't make the board. */
  submit(name: string, score: number, time: number): number {
    const entry: LeaderboardEntry = {
      name: name || 'ANON',
      score,
      time: Math.round(time),
      date: new Date().toISOString(),
    };

    if (!this.data[this.weekKey]) {
      this.data[this.weekKey] = [];
    }

    const entries = this.data[this.weekKey];
    entries.push(entry);
    entries.sort((a, b) => b.score - a.score);

    // Trim to top N
    if (entries.length > MAX_ENTRIES) {
      entries.length = MAX_ENTRIES;
    }

    this.save();

    // Find rank
    const rank = entries.findIndex(e => e === entry);
    return rank >= 0 ? rank + 1 : 0;
  }

  /** Get top display entries (top 10) for the current week */
  getDisplayEntries(): LeaderboardEntry[] {
    const entries = this.data[this.weekKey] || [];
    return entries.slice(0, DISPLAY_ENTRIES);
  }

  /** Get all entries for the current week */
  getEntries(): LeaderboardEntry[] {
    return this.data[this.weekKey] || [];
  }

  /** Get the best entry for a given name this week. Returns { score, rank } or null. */
  getBestForName(name: string): { score: number; rank: number } | null {
    const entries = this.data[this.weekKey] || [];
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].name === name) {
        return { score: entries[i].score, rank: i + 1 };
      }
    }
    return null;
  }

  /** Get the current week key */
  getWeekKey(): string {
    return this.weekKey;
  }

  private load(): LeaderboardData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore corrupt data */ }
    return {};
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch { /* localStorage full or unavailable */ }
  }
}
