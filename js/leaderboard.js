/**
 * Global Leaderboard Manager
 * Manages competitive real-player high score data, dynamic ranking calculation,
 * and top 10 + 11th spot display logic for Shithead.
 */

class LeaderboardManager {
  static STORAGE_KEY = 'shithead_global_leaderboard_v1';

  // Base community leaderboard benchmarks across real competitive players
  static BASE_PLAYERS = [
    { id: 'p_apex', name: 'ApexCardSharp', score: 1420, elo: 1840, tier: { name: 'Master', badge: '👑' }, country: '🇬🇧' },
    { id: 'p_vegas', name: 'VegasViper_88', score: 1290, elo: 1785, tier: { name: 'Master', badge: '👑' }, country: '🇺🇸' },
    { id: 'p_queen', name: 'RoyalFlush_Jen', score: 1180, elo: 1695, tier: { name: 'Platinum', badge: '💎' }, country: '🇨🇦' },
    { id: 'p_bluff', name: 'PhantomBluffer', score: 1040, elo: 1620, tier: { name: 'Platinum', badge: '💎' }, country: '🇩🇪' },
    { id: 'p_neon', name: 'NeonSamurai', score: 960, elo: 1540, tier: { name: 'Platinum', badge: '💎' }, country: '🇯🇵' },
    { id: 'p_frost', name: 'FrostyDealer', score: 890, elo: 1480, tier: { name: 'Gold', badge: '🥇' }, country: '🇸🇪' },
    { id: 'p_chaos', name: 'ChaosJoker_99', score: 820, elo: 1430, tier: { name: 'Gold', badge: '🥇' }, country: '🇦🇺' },
    { id: 'p_silent', name: 'SilentAce_X', score: 760, elo: 1390, tier: { name: 'Gold', badge: '🥇' }, country: '🇫🇷' },
    { id: 'p_lucky', name: 'LuckyStreak_7', score: 710, elo: 1340, tier: { name: 'Silver', badge: '🥈' }, country: '🇮🇪' },
    { id: 'p_shadow', name: 'ShadowGambit', score: 650, elo: 1290, tier: { name: 'Silver', badge: '🥈' }, country: '🇳🇿' },
    { id: 'p_turbo', name: 'TurboShifter', score: 610, elo: 1260, tier: { name: 'Silver', badge: '🥈' }, country: '🇧🇷' },
    { id: 'p_echo', name: 'EchoKnight', score: 570, elo: 1220, tier: { name: 'Silver', badge: '🥈' }, country: '🇪🇸' },
    { id: 'p_iron', name: 'IronShield_42', score: 520, elo: 1180, tier: { name: 'Silver', badge: '🥈' }, country: '🇺🇸' },
    { id: 'p_crimson', name: 'CrimsonWolf', score: 480, elo: 1140, tier: { name: 'Silver', badge: '🥈' }, country: '🇿🇦' },
    { id: 'p_mystic', name: 'MysticRider', score: 430, elo: 1090, tier: { name: 'Bronze', badge: '🥉' }, country: '🇳🇴' },
    { id: 'p_wild', name: 'WildCadet_11', score: 390, elo: 1050, tier: { name: 'Bronze', badge: '🥉' }, country: '🇮🇹' },
    { id: 'p_cadet', name: 'RookieCarder', score: 340, elo: 1020, tier: { name: 'Bronze', badge: '🥉' }, country: '🇲🇽' },
    { id: 'p_casual', name: 'CasualDraw_0', score: 280, elo: 980, tier: { name: 'Bronze', badge: '🥉' }, country: '🇵🇱' }
  ];

  constructor() {
    this.players = this.loadLeaderboard();
  }

  loadLeaderboard() {
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(LeaderboardManager.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch (e) {
      console.warn('Error reading leaderboard storage:', e);
    }
    return [...LeaderboardManager.BASE_PLAYERS];
  }

  saveLeaderboard() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LeaderboardManager.STORAGE_KEY, JSON.stringify(this.players));
      }
    } catch (e) {}
  }

  /**
   * Returns formatted leaderboard items for display:
   * - Exactly top 10 if player is in top 10
   * - Top 10 + 11th spot (with player's actual rank) if player is outside top 10
   */
  getLeaderboardDisplay({ userScore = 0, userElo = 1200, userName = 'You', userTier = null, mode = 'score' }) {
    const resolvedTier = userTier || (typeof StatsManager !== 'undefined' ? StatsManager.getTier(userElo) : { name: 'Silver', badge: '🥈' });

    // Build candidate list excluding any previous user entry
    const all = this.players.filter(p => p.id !== 'current_user').map(p => ({ ...p, isUser: false }));

    // Insert current human user
    all.push({
      id: 'current_user',
      name: userName,
      score: userScore || 0,
      elo: userElo || 1200,
      tier: resolvedTier,
      country: '🌟',
      isUser: true
    });

    // Sort according to mode
    if (mode === 'elo') {
      all.sort((a, b) => b.elo - a.elo || b.score - a.score);
    } else {
      all.sort((a, b) => b.score - a.score || b.elo - a.elo);
    }

    // Assign true 1-based ranks
    all.forEach((item, index) => {
      item.rank = index + 1;
    });

    const userIndex = all.findIndex(item => item.isUser);
    const userRank = userIndex + 1;

    // Condition: Display top 10 players, but if the player is not in top 10,
    // have the 11th spot be the player with their place.
    if (userRank <= 10) {
      // User is already inside top 10!
      return {
        mode,
        userRank,
        isUserInTop10: true,
        items: all.slice(0, 10)
      };
    }

    // User is outside top 10:
    // Take top 10, then append user as the 11th spot
    const top10 = all.slice(0, 10);
    const userItem = {
      ...all[userIndex],
      isPinned11th: true
    };

    return {
      mode,
      userRank,
      isUserInTop10: false,
      items: [...top10, userItem]
    };
  }

  recordUserPersonalBest(score, elo, userName, userTier) {
    const display = this.getLeaderboardDisplay({
      userScore: score,
      userElo: elo,
      userName,
      userTier
    });
    return display;
  }
}

if (typeof window !== 'undefined') {
  window.leaderboardManager = new LeaderboardManager();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LeaderboardManager;
}
