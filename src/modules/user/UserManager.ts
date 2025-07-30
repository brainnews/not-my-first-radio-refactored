/**
 * User management module for username and user data
 */

import { UserStats } from '@/types/app';
import { StationListeningTimes } from '@/types/station';
import { eventManager } from '@/utils/events';
import { getStorageItem, setStorageItem, StorageKeys } from '@/utils/storage';

export interface UserManagerConfig {
  autoGenerateUsername?: boolean;
  maxUsernameLength?: number;
}

/**
 * Manages user data, username, and achievements
 */
export class UserManager {
  private username: string = '';
  private userStats!: UserStats;
  private config: UserManagerConfig;

  // Offensive words filter
  private readonly offensiveWords = [
    'fuck', 'shit', 'bitch', 'damn', 'hell', 'ass', 'crap', 'piss',
    'bastard', 'slut', 'whore', 'fag', 'retard', 'nigger', 'nazi',
    'hitler', 'gay', 'lesbian', 'homo', 'queer', 'tranny'
  ];

  // Random username components
  private readonly adjectives = [
    'Happy', 'Peaceful', 'Cheerful', 'Bright', 'Calm', 'Cool', 'Swift',
    'Smart', 'Brave', 'Kind', 'Gentle', 'Wise', 'Strong', 'Quick',
    'Silent', 'Golden', 'Silver', 'Crystal', 'Magic', 'Electric',
    'Cosmic', 'Ocean', 'Mountain', 'Forest', 'Desert', 'Arctic',
    'Tropical', 'Urban', 'Classic', 'Modern', 'Vintage', 'Future'
  ];

  private readonly nouns = [
    'Listener', 'Explorer', 'Wanderer', 'Dreamer', 'Seeker', 'Hunter',
    'Player', 'Dancer', 'Singer', 'Artist', 'Creator', 'Builder',
    'Traveler', 'Rider', 'Pilot', 'Captain', 'Chief', 'Master',
    'Guardian', 'Warrior', 'Hero', 'Champion', 'Legend', 'Star',
    'Phoenix', 'Dragon', 'Eagle', 'Wolf', 'Lion', 'Tiger',
    'Bear', 'Shark', 'Falcon', 'Raven', 'Fox', 'Owl'
  ];

  constructor(config: UserManagerConfig = {}) {
    this.config = {
      autoGenerateUsername: true,
      maxUsernameLength: 20,
      ...config
    };

    this.loadUserData();
    this.setupEventListeners();
  }

  /**
   * Load user data from storage
   */
  private loadUserData(): void {
    this.username = getStorageItem(StorageKeys.USERNAME, '');
    
    this.userStats = getStorageItem(StorageKeys.USER_STATS, {
      totalStationsAdded: 0,
      totalPlayTime: 0,
      stationsPlayed: 0,
      countriesExplored: 0,
      achievementsUnlocked: 0,
      dateJoined: new Date().toISOString()
    });

    // Generate username if needed
    if (!this.username && this.config.autoGenerateUsername) {
      this.username = this.generateRandomUsername();
      this.saveUsername();
    }

    eventManager.emit('user:loaded', {
      username: this.username,
      stats: this.userStats
    });
  }

  /**
   * Reload user data from storage (public method for external use)
   */
  reloadFromStorage(): void {
    this.loadUserData();
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    eventManager.on('user:username-change', (newUsername: string) => {
      this.setUsername(newUsername);
    });

    eventManager.on('user:stats-update', (updates: Partial<UserStats>) => {
      this.updateStats(updates);
    });

    eventManager.on('user:stats-reset', (resetStats: UserStats) => {
      this.userStats = { ...resetStats };
      eventManager.emit('user:stats-updated', this.userStats);
    });

    // Listen for per-station listening time updates to sync global totals
    eventManager.on('player:listening-time', (data: { totalTime: number, station: any }) => {
      this.syncGlobalListeningTime();
    });
  }

  /**
   * Get current username
   */
  getUsername(): string {
    return this.username;
  }

  /**
   * Set username with validation
   */
  setUsername(newUsername: string): boolean {
    const cleanedUsername = this.validateAndCleanUsername(newUsername);
    
    if (!cleanedUsername) {
      eventManager.emit('user:username-error', 'Invalid username');
      return false;
    }

    this.username = cleanedUsername;
    this.saveUsername();
    
    eventManager.emit('user:username-changed', this.username);
    return true;
  }

  /**
   * Validate and clean username
   */
  private validateAndCleanUsername(username: string): string | null {
    if (!username || username.trim().length === 0) {
      return null;
    }

    // Clean and trim
    let cleaned = username.trim().toLowerCase();
    
    // Check length
    if (cleaned.length > (this.config.maxUsernameLength || 20)) {
      return null;
    }

    // Check for offensive words
    if (this.containsOffensiveWords(cleaned)) {
      return null;
    }

    // Remove special characters except letters, numbers, and basic punctuation
    cleaned = cleaned.replace(/[^a-z0-9\s\-_]/g, '');
    
    if (cleaned.length < 2) {
      return null;
    }

    return cleaned;
  }

  /**
   * Check for offensive words
   */
  private containsOffensiveWords(text: string): boolean {
    const lowerText = text.toLowerCase();
    return this.offensiveWords.some(word => lowerText.includes(word));
  }

  /**
   * Generate random username
   */
  generateRandomUsername(): string {
    const adjective = this.adjectives[Math.floor(Math.random() * this.adjectives.length)];
    const noun = this.nouns[Math.floor(Math.random() * this.nouns.length)];
    const number = Math.floor(Math.random() * 100);
    
    return `${adjective}${noun}${number}`;
  }

  /**
   * Save username to storage
   */
  private saveUsername(): void {
    setStorageItem(StorageKeys.USERNAME, this.username);
  }

  /**
   * Get user statistics
   */
  getStats(): UserStats {
    return { ...this.userStats };
  }

  /**
   * Update user statistics
   */
  updateStats(updates: Partial<UserStats>): void {
    this.userStats = { ...this.userStats, ...updates };
    setStorageItem(StorageKeys.USER_STATS, this.userStats);
    eventManager.emit('user:stats-updated', this.userStats);
  }

  /**
   * Increment a stat by a value
   */
  incrementStat(stat: keyof UserStats, value: number = 1): void {
    if (typeof this.userStats[stat] === 'number') {
      this.updateStats({ [stat]: (this.userStats[stat] as number) + value } as Partial<UserStats>);
    }
  }


  /**
   * Create user profile summary
   */
  createProfileSummary(): {
    username: string;
    memberSince: string;
    stats: UserStats;
  } {
    return {
      username: this.username,
      memberSince: this.userStats.dateJoined,
      stats: this.userStats
    };
  }

  /**
   * Sync global listening time from per-station data
   */
  private syncGlobalListeningTime(): void {
    const listeningTimes = getStorageItem<StationListeningTimes>(StorageKeys.STATION_LISTENING_TIMES, {});
    
    // Calculate total listening time across all stations
    const totalListeningTime = Object.values(listeningTimes).reduce((sum, data) => sum + data.totalTime, 0);
    
    // Update user stats if different
    if (this.userStats.totalPlayTime !== totalListeningTime) {
      this.updateStats({ totalPlayTime: totalListeningTime });
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    eventManager.removeAllListeners('user:username-change');
    eventManager.removeAllListeners('user:stats-update');
    eventManager.removeAllListeners('user:stats-reset');
    eventManager.removeAllListeners('player:listening-time');
  }
}