/**
 * Player Profile & Google Play Games Account Manager
 * Manages unique gamer handles, Google Play account linking, and cloud sync status.
 */

class ProfileManager {
  static STORAGE_KEY = 'shithead_player_profile_v2';

  static PREFIXES = [
    'Ace', 'Shadow', 'Bluff', 'Royal', 'Wild', 'Apex', 'Phantom', 
    'Silent', 'Neon', 'Viper', 'Iron', 'Lucky', 'Mystic', 'Turbo', 
    'Cyber', 'Crimson', 'Storm', 'Frost', 'Echo', 'Chaos'
  ];

  static SUFFIXES = [
    'Challenger', 'King', 'Master', 'Dealer', 'Ninja', 'Captain', 
    'Gambit', 'Slayer', 'Rider', 'Wizard', 'Ghost', 'Joker', 
    'Striker', 'Titan', 'Knight', 'Fox', 'Hawk', 'Wolf'
  ];

  constructor() {
    this.profile = this.loadProfile();
    if (!this.profile.playerName) {
      this.profile.playerName = this.generateUniqueName();
      this.saveProfile();
    }
  }

  generateUniqueName() {
    const prefix = ProfileManager.PREFIXES[Math.floor(Math.random() * ProfileManager.PREFIXES.length)];
    const suffix = ProfileManager.SUFFIXES[Math.floor(Math.random() * ProfileManager.SUFFIXES.length)];
    const num = Math.floor(100 + Math.random() * 900);
    return `${prefix}${suffix}_${num}`;
  }

  loadProfile() {
    const defaultProfile = {
      playerName: '',
      isGooglePlayLinked: false,
      googlePlayGamerTag: '',
      googlePlayAvatar: '🎮',
      googlePlayId: null,
      lastSyncedAt: null
    };

    try {
      if (typeof localStorage !== 'undefined') {
        const data = localStorage.getItem(ProfileManager.STORAGE_KEY);
        if (data) {
          return { ...defaultProfile, ...JSON.parse(data) };
        }
      }
    } catch (e) {
      console.warn('Error reading player profile:', e);
    }
    return defaultProfile;
  }

  saveProfile() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ProfileManager.STORAGE_KEY, JSON.stringify(this.profile));
      }
    } catch (e) {
      console.warn('Error saving player profile:', e);
    }
  }

  getProfile() {
    return { ...this.profile };
  }

  getDisplayName() {
    if (this.profile.isGooglePlayLinked && this.profile.googlePlayGamerTag) {
      return this.profile.googlePlayGamerTag;
    }
    return this.profile.playerName || 'Player';
  }

  setPlayerName(name) {
    if (!name || typeof name !== 'string') return false;
    const cleanName = name.trim().slice(0, 20);
    if (!cleanName) return false;
    this.profile.playerName = cleanName;
    this.saveProfile();
    return true;
  }

  linkGooglePlayAccount(gamerTag = null) {
    const defaultTag = gamerTag || `PlayGamer_${Math.floor(1000 + Math.random() * 9000)}`;
    this.profile.isGooglePlayLinked = true;
    this.profile.googlePlayGamerTag = defaultTag;
    this.profile.googlePlayId = `gp_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    this.profile.googlePlayAvatar = '🎮';
    this.profile.lastSyncedAt = Date.now();
    this.saveProfile();
    return { ...this.profile };
  }

  unlinkGooglePlayAccount() {
    this.profile.isGooglePlayLinked = false;
    this.profile.googlePlayGamerTag = '';
    this.profile.googlePlayId = null;
    this.profile.lastSyncedAt = null;
    this.saveProfile();
    return { ...this.profile };
  }

  syncCloudScores(stats) {
    if (!this.profile.isGooglePlayLinked) return null;
    this.profile.lastSyncedAt = Date.now();
    this.saveProfile();
    return {
      synced: true,
      timestamp: this.profile.lastSyncedAt,
      gamerTag: this.profile.googlePlayGamerTag,
      highScore: stats ? stats.highScore : 0,
      elo: stats ? stats.elo : 1200
    };
  }

  resetProfile() {
    this.profile = {
      playerName: this.generateUniqueName(),
      isGooglePlayLinked: false,
      googlePlayGamerTag: '',
      googlePlayAvatar: '🎮',
      googlePlayId: null,
      lastSyncedAt: null
    };
    this.saveProfile();
    return { ...this.profile };
  }
}

if (typeof window !== 'undefined') {
  window.profileManager = new ProfileManager();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ProfileManager;
}
