/**
 * Ultra-Durable Statistics, Action High-Score & Competitive Elo Manager
 * Dual-layer persistence using localStorage + IndexedDB backup + navigator.storage.persist()
 * Guarantees stats are preserved across app restarts, browser closes, and OS memory reclamation.
 */

class StatsManager {
  static STORAGE_KEY = 'shithead_pwa_stats_v2';
  static LEGACY_KEY = 'shithead_pwa_stats';

  static TIERS = [
    { name: 'Bronze', badge: '🥉', min: 0, max: 1099, color: '#cd7f32', nextTier: 'Silver' },
    { name: 'Silver', badge: '🥈', min: 1100, max: 1299, color: '#94a3b8', nextTier: 'Gold' },
    { name: 'Gold', badge: '🥇', min: 1300, max: 1499, color: '#f59e0b', nextTier: 'Platinum' },
    { name: 'Platinum', badge: '💎', min: 1500, max: 1699, color: '#38bdf8', nextTier: 'Master' },
    { name: 'Master', badge: '👑', min: 1700, max: Infinity, color: '#ec4899', nextTier: null }
  ];

  static DIFFICULTY_STAKES = {
    easy: {
      name: 'Easy',
      badge: '🌱',
      winElo: 18,
      secondElo: 6,
      thirdElo: -6,
      lossElo: -16,
      scoreMultiplier: 0.75,
      description: 'Casual bots, relaxed playstyle, forgiving stakes.',
      desc: 'Casual bots, relaxed playstyle, forgiving stakes.'
    },
    medium: {
      name: 'Medium',
      badge: '⚔️',
      winElo: 30,
      secondElo: 10,
      thirdElo: -10,
      lossElo: -28,
      scoreMultiplier: 1.0,
      description: 'Standard bots, balanced playstyle, standard stakes.',
      desc: 'Standard bots, balanced playstyle, standard stakes.'
    },
    hard: {
      name: 'Hard',
      badge: '🔥',
      winElo: 45,
      secondElo: 15,
      thirdElo: -15,
      lossElo: -40,
      scoreMultiplier: 1.35,
      description: 'Aggressive burning, strategic wildcards, high risk/reward.',
      desc: 'Aggressive burning, strategic wildcards, high risk/reward.'
    },
    master: {
      name: 'Master',
      badge: '👑',
      winElo: 65,
      secondElo: 22,
      thirdElo: -22,
      lossElo: -55,
      scoreMultiplier: 1.75,
      description: 'Elite bots, card counting, reverse traps, maximum stakes.',
      desc: 'Elite bots, card counting, reverse traps, maximum stakes.'
    }
  };

  static getRecommendedDifficulty(elo) {
    const r = Math.max(0, Math.round(elo || 1200));
    if (r < 1100) return 'easy';
    if (r < 1300) return 'medium';
    if (r < 1500) return 'hard';
    return 'master';
  }

  static getTier(elo) {
    const r = Math.max(0, Math.round(elo));
    for (let i = StatsManager.TIERS.length - 1; i >= 0; i--) {
      const tier = StatsManager.TIERS[i];
      if (r >= tier.min) {
        let progress = 100;
        let pointsNeeded = 0;
        if (tier.max !== Infinity) {
          progress = Math.min(100, Math.max(0, Math.round(((r - tier.min) / (tier.max - tier.min + 1)) * 100)));
          pointsNeeded = (tier.max + 1) - r;
        }
        return {
          ...tier,
          elo: r,
          progress,
          pointsNeeded
        };
      }
    }
    return { ...StatsManager.TIERS[0], elo: r, progress: 0, pointsNeeded: 1100 - r };
  }

  static calculateEloDelta({ humanRank, currentStreak = 0, difficulty = 'medium' }) {
    const stakes = StatsManager.DIFFICULTY_STAKES[difficulty] || StatsManager.DIFFICULTY_STAKES.medium;
    let delta = 0;
    if (humanRank === 1) {
      const streakBonus = Math.min(15, (currentStreak || 0) * 5);
      delta = stakes.winElo + streakBonus;
    } else if (humanRank === 2) {
      delta = stakes.secondElo;
    } else if (humanRank === 3) {
      delta = stakes.thirdElo;
    } else {
      delta = stakes.lossElo;
    }
    return delta;
  }

  constructor() {
    this.cachedStats = this.loadStatsSync();
    this.db = null;
    this.initIndexedDB();
    this.requestPersistentStorage();
  }

  requestPersistentStorage() {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(granted => {
        if (granted) {
          console.log('[Stats] Persistent storage granted by OS');
        }
      }).catch(() => {});
    }
  }

  loadStatsSync() {
    const defaultStats = {
      gamesPlayed: 0,
      wins: 0,          // 1st place victories
      secondPlaces: 0,  // 2nd place finishes
      thirdPlaces: 0,   // 3rd place finishes
      shitheads: 0,     // Last place / loser
      currentStreak: 0, // Current active win streak
      bestStreak: 0,    // Best ever win streak
      elo: 1200,        // Starting competitive rating
      peakElo: 1200,    // All-time highest rating
      highScore: 0,     // Best single match action score
      totalScore: 0,    // Lifetime cumulative action points
      history: []       // Recent match log
    };

    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(StatsManager.STORAGE_KEY) || localStorage.getItem(StatsManager.LEGACY_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          // Auto-migrate legacy format
          return {
            ...defaultStats,
            ...parsed,
            elo: parsed.elo ?? 1200,
            peakElo: Math.max(parsed.peakElo ?? 1200, parsed.elo ?? 1200),
            highScore: parsed.highScore || 0,
            totalScore: parsed.totalScore || 0,
            wins: parsed.wins || 0,
            gamesPlayed: parsed.gamesPlayed || 0,
            shitheads: parsed.shitheads || 0
          };
        }
      }
    } catch (err) {
      console.warn('[Stats] Error reading localStorage:', err);
    }
    return defaultStats;
  }

  saveStatsSync(stats) {
    this.cachedStats = { ...stats };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(StatsManager.STORAGE_KEY, JSON.stringify(this.cachedStats));
      }
    } catch (err) {
      console.warn('[Stats] Error saving to localStorage:', err);
    }
    this.saveToIndexedDB(this.cachedStats);
  }

  getStats() {
    return this.cachedStats;
  }

  recordGameResult({ humanRank, totalPlayers = 4, shitheadIsHuman = false, matchScore = 0, cleanSheet = false, difficulty = 'medium' }) {
    const s = { ...this.getStats() };
    s.gamesPlayed = (s.gamesPlayed || 0) + 1;

    // Track placements & streak
    if (humanRank === 1) {
      s.wins = (s.wins || 0) + 1;
      s.currentStreak = (s.currentStreak || 0) + 1;
      s.bestStreak = Math.max(s.bestStreak || 0, s.currentStreak);
    } else {
      s.currentStreak = 0;
      if (shitheadIsHuman) {
        s.shitheads = (s.shitheads || 0) + 1;
      } else if (humanRank === 2) {
        s.secondPlaces = (s.secondPlaces || 0) + 1;
      } else if (humanRank === 3) {
        s.thirdPlaces = (s.thirdPlaces || 0) + 1;
      }
    }

    const stakes = StatsManager.DIFFICULTY_STAKES[difficulty] || StatsManager.DIFFICULTY_STAKES.medium;

    // Action High-Score updates (scaled by difficulty scoreMultiplier)
    const rawScore = Math.max(0, Math.round(matchScore || 0));
    const scoreVal = Math.round(rawScore * stakes.scoreMultiplier);
    const isNewHighScore = scoreVal > (s.highScore || 0);
    s.highScore = Math.max(s.highScore || 0, scoreVal);
    s.totalScore = (s.totalScore || 0) + scoreVal;

    // Elo Rating calculation with difficulty stakes
    const oldElo = s.elo || 1200;
    const oldTier = StatsManager.getTier(oldElo);
    const eloDelta = StatsManager.calculateEloDelta({ humanRank, currentStreak: s.currentStreak, difficulty });
    const newElo = Math.max(100, oldElo + eloDelta);
    const newTier = StatsManager.getTier(newElo);
    s.elo = newElo;
    s.peakElo = Math.max(s.peakElo || 1200, newElo);

    const promoted = newTier.min > oldTier.min;
    const demoted = newTier.min < oldTier.min;

    if (!Array.isArray(s.history)) s.history = [];
    s.history.unshift({
      date: new Date().toISOString(),
      rank: humanRank,
      isWinner: humanRank === 1,
      isShithead: shitheadIsHuman,
      matchScore: scoreVal,
      cleanSheet: !!cleanSheet,
      difficulty,
      eloDelta,
      elo: newElo
    });
    if (s.history.length > 25) s.history.pop();

    this.saveStatsSync(s);

    return {
      stats: s,
      oldElo,
      newElo,
      eloDelta,
      oldTier,
      newTier,
      promoted,
      demoted,
      isNewHighScore,
      matchScore: scoreVal,
      cleanSheet: !!cleanSheet,
      difficulty,
      stakes
    };
  }

  initIndexedDB() {
    if (typeof indexedDB === 'undefined') return;
    try {
      const req = indexedDB.open('shithead_pwa_db', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('stats')) {
          db.createObjectStore('stats', { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => {
        this.db = e.target.result;
        // Check if IndexedDB has newer or recovered data
        try {
          const tx = this.db.transaction('stats', 'readonly');
          const store = tx.objectStore('stats');
          const getReq = store.get('current_stats');
          getReq.onsuccess = () => {
            if (getReq.result && getReq.result.data) {
              const dbStats = getReq.result.data;
              if ((dbStats.gamesPlayed || 0) > (this.cachedStats.gamesPlayed || 0)) {
                console.log('[Stats] Recovered persistent stats from IndexedDB!');
                this.saveStatsSync(dbStats);
              }
            }
          };
        } catch (readErr) {}
      };
    } catch (e) {
      console.warn('[Stats] IndexedDB init error:', e);
    }
  }

  saveToIndexedDB(stats) {
    if (!this.db) return;
    try {
      const tx = this.db.transaction('stats', 'readwrite');
      const store = tx.objectStore('stats');
      store.put({ id: 'current_stats', data: stats, updatedAt: Date.now() });
    } catch (e) {
      console.warn('[Stats] IndexedDB save error:', e);
    }
  }

  resetStats() {
    const fresh = {
      gamesPlayed: 0,
      wins: 0,
      secondPlaces: 0,
      thirdPlaces: 0,
      shitheads: 0,
      currentStreak: 0,
      bestStreak: 0,
      elo: 1200,
      peakElo: 1200,
      highScore: 0,
      totalScore: 0,
      history: []
    };
    this.saveStatsSync(fresh);
    return fresh;
  }
}

// Global singleton instance
const statsManager = new StatsManager();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StatsManager, statsManager };
}
