/**
 * Achievement system manager for tracking and displaying user achievements
 */

import { Achievement, UserStats } from '@/types/app';
import { LocalStation } from '@/types/station';
import { eventManager } from '@/utils/events';
import { getStorageItem, setStorageItem } from '@/utils/storage';
import { StorageKeys } from '@/utils/storage';

export interface AchievementManagerConfig {
  enableNotifications?: boolean;
  notificationDuration?: number;
}

export interface AchievementCategory {
  id: string;
  name: string;
  icon: string;
  achievements: Achievement[];
}

export interface AchievementProgress {
  achievementId: string;
  progress: number;
  maxProgress: number;
  unlocked: boolean;
}

/**
 * Manages the complete achievement system
 */
export class AchievementManager {
  private achievements: Map<string, Achievement> = new Map();
  private config: AchievementManagerConfig;
  private userStats: UserStats;
  private categories: AchievementCategory[] = [];

  constructor(config: AchievementManagerConfig = {}) {
    this.config = {
      enableNotifications: true,
      notificationDuration: 5000,
      ...config
    };

    this.initializeAchievements();
    this.loadProgress();
    this.initializeCountriesExplored();
    this.setupEventListeners();
  }

  /**
   * Initialize all achievement definitions
   */
  private initializeAchievements(): void {
    const achievementDefinitions: Achievement[] = [
      // Collection Achievements
      {
        id: 'first_station',
        name: 'First Tune',
        description: 'Add your first radio station to the collection',
        icon: '🎵',
        unlocked: false,
        maxProgress: 1
      },
      {
        id: 'five_stations',
        name: 'Growing Collection',
        description: 'Add 5 radio stations to your collection',
        icon: '📻',
        unlocked: false,
        maxProgress: 5
      },
      {
        id: 'twenty_stations',
        name: 'Radio Enthusiast',
        description: 'Add 20 radio stations to your collection',
        icon: '🔊',
        unlocked: false,
        maxProgress: 20
      },
      {
        id: 'fifty_stations',
        name: 'Station Collector',
        description: 'Add 50 radio stations to your collection',
        icon: '🎧',
        unlocked: false,
        maxProgress: 50
      },

      // Discovery Achievements
      {
        id: 'world_explorer',
        name: 'World Explorer',
        description: 'Add stations from 10 different countries',
        icon: '🌍',
        unlocked: false,
        maxProgress: 10
      },
      {
        id: 'quality_hunter',
        name: 'Quality Hunter',
        description: 'Add a station with 320+ kbps quality',
        icon: '💎',
        unlocked: false,
        maxProgress: 1
      },

      // Listening Achievements
      {
        id: 'music_lover',
        name: 'Music Lover',
        description: 'Listen to radio for a total of 10 hours',
        icon: '❤️',
        unlocked: false,
        maxProgress: 36000000 // 10 hours in milliseconds
      },
      {
        id: 'night_owl',
        name: 'Night Owl',
        description: 'Listen to radio between midnight and 6 AM',
        icon: '🦉',
        unlocked: false,
        maxProgress: 1
      },
      {
        id: 'early_bird',
        name: 'Early Bird',
        description: 'Listen to radio between 5 AM and 7 AM',
        icon: '🐦',
        unlocked: false,
        maxProgress: 1
      },

      // Social Achievements
      {
        id: 'social_listener',
        name: 'Social Listener',
        description: 'Share a station list with others',
        icon: '🤝',
        unlocked: false,
        maxProgress: 1
      },

      // Technical Achievements
      {
        id: 'data_manager',
        name: 'Data Manager',
        description: 'Export or import station data',
        icon: '📊',
        unlocked: false,
        maxProgress: 1
      }
    ];

    achievementDefinitions.forEach(achievement => {
      this.achievements.set(achievement.id, achievement);
    });

    this.initializeCategories();
  }

  /**
   * Initialize achievement categories
   */
  private initializeCategories(): void {
    this.categories = [
      {
        id: 'collection',
        name: 'Collection',
        icon: '📚',
        achievements: [
          this.achievements.get('first_station')!,
          this.achievements.get('five_stations')!,
          this.achievements.get('twenty_stations')!,
          this.achievements.get('fifty_stations')!
        ]
      },
      {
        id: 'discovery',
        name: 'Discovery',
        icon: '🔍',
        achievements: [
          this.achievements.get('world_explorer')!,
          this.achievements.get('quality_hunter')!
        ]
      },
      {
        id: 'listening',
        name: 'Listening',
        icon: '🎧',
        achievements: [
          this.achievements.get('music_lover')!,
          this.achievements.get('night_owl')!,
          this.achievements.get('early_bird')!
        ]
      },
      {
        id: 'social',
        name: 'Social',
        icon: '🤝',
        achievements: [
          this.achievements.get('social_listener')!
        ]
      },
      {
        id: 'technical',
        name: 'Technical',
        icon: '⚡',
        achievements: [
          this.achievements.get('data_manager')!
        ]
      }
    ];
  }

  /**
   * Load achievement progress from storage
   */
  private loadProgress(): void {
    try {
      const savedAchievements = getStorageItem<Achievement[]>(StorageKeys.ACHIEVEMENTS, []);
      const savedStats = getStorageItem<UserStats>(StorageKeys.USER_STATS, this.getDefaultUserStats());

      this.userStats = savedStats;

      // Merge saved progress with current achievements
      savedAchievements.forEach(savedAchievement => {
        const current = this.achievements.get(savedAchievement.id);
        if (current) {
          // Only copy progress data, not definition data like maxProgress
          if (savedAchievement.progress !== undefined) {
            current.progress = savedAchievement.progress;
          }
          if (savedAchievement.unlocked !== undefined) {
            current.unlocked = savedAchievement.unlocked;
          }
          if (savedAchievement.unlockedAt !== undefined) {
            current.unlockedAt = savedAchievement.unlockedAt;
          }
        }
      });

      // Update categories with loaded achievements
      this.initializeCategories();

    } catch (error) {
      console.warn('[AchievementManager] Failed to load progress:', error);
      this.userStats = this.getDefaultUserStats();
    }
  }

  /**
   * Get default user stats
   */
  private getDefaultUserStats(): UserStats {
    return {
      totalStationsAdded: 0,
      totalPlayTime: 0,
      stationsPlayed: 0,
      countriesExplored: 0,
      achievementsUnlocked: 0,
      dateJoined: new Date().toISOString()
    };
  }

  /**
   * Set up event listeners for achievement tracking
   */
  private setupEventListeners(): void {
    eventManager.on('achievements:check', (payload: { trigger: string; data?: any } | string) => {
      if (typeof payload === 'string') {
        this.checkAchievements(payload);
      } else {
        this.checkAchievements(payload.trigger, payload.data);
      }
    });

    eventManager.on('achievements:unlock', (achievementId: string) => {
      this.unlockAchievement(achievementId);
    });

    eventManager.on('achievements:reset', () => {
      this.resetAllAchievements();
    });

    // Listen for station events directly
    eventManager.on('station:added', (station?: any) => {
      this.trackProgress('stationAdded', this.userStats.totalStationsAdded + 1, station);
    });

    eventManager.on('station:play', (station?: any) => {
      this.trackProgress('stationPlayed', 1, station);
    });


    // Provide data for modal
    eventManager.on('achievements:request-data', (callback: any) => {
      callback({
        categories: this.getCategories(),
        userStats: this.getUserStats()
      });
    });
  }

  /**
   * Check achievements based on trigger
   */
  public checkAchievements(trigger: string, data?: any): void {
    switch (trigger) {
      case 'station:added':
        this.checkStationAchievements(data);
        break;
      case 'station:play':
        this.checkListeningAchievements(data);
        break;
      case 'station:share':
        this.checkSocialAchievements();
        break;
      case 'data:import':
      case 'data:export':
        this.checkTechnicalAchievements('data_manager');
        break;
    }
  }

  /**
   * Check station collection achievements
   */
  private checkStationAchievements(station?: any): void {
    const stationCount = this.userStats.totalStationsAdded;

    // Check collection achievements
    this.updateAchievementProgress('first_station', Math.min(stationCount, 1));
    this.updateAchievementProgress('five_stations', Math.min(stationCount, 5));
    this.updateAchievementProgress('twenty_stations', Math.min(stationCount, 20));
    this.updateAchievementProgress('fifty_stations', Math.min(stationCount, 50));

    // Check quality achievement
    if (station && station.bitrate && station.bitrate >= 320) {
      this.updateAchievementProgress('quality_hunter', 1);
    }

    // Check world explorer (country diversity)
    if (station && (station.countrycode || station.country)) {
      this.trackCountryExploration(station);
    }
  }

  /**
   * Track country exploration for World Explorer achievement
   */
  private trackCountryExploration(station: LocalStation): void {
    const country = station.countrycode || station.country;
    if (!country) return;

    // Get existing explored countries
    const exploredCountries = getStorageItem<string[]>(StorageKeys.EXPLORED_COUNTRIES, []);
    
    // Check if this is a new country
    const countryIdentifier = country.toLowerCase().trim();
    if (!exploredCountries.includes(countryIdentifier)) {
      // Add new country to the list
      exploredCountries.push(countryIdentifier);
      setStorageItem(StorageKeys.EXPLORED_COUNTRIES, exploredCountries);
      
      // Update user stats
      this.userStats.countriesExplored = exploredCountries.length;
      this.saveUserStats();
      
      // Update achievement progress
      this.updateAchievementProgress('world_explorer', exploredCountries.length);
      
      console.log(`[AchievementManager] New country explored: ${country} (${exploredCountries.length} total)`);
    }
  }

  /**
   * Initialize countries explored count based on existing stations
   */
  private initializeCountriesExplored(): void {
    // Get existing explored countries from storage
    const exploredCountries = getStorageItem<string[]>(StorageKeys.EXPLORED_COUNTRIES, []);
    
    // Update user stats to match stored countries
    this.userStats.countriesExplored = exploredCountries.length;
    
    // If no countries stored yet, scan existing stations to populate
    if (exploredCountries.length === 0) {
      // Get stations from storage to scan for countries
      const stations = getStorageItem<LocalStation[]>(StorageKeys.STATIONS, []);
      const uniqueCountries = new Set<string>();
      
      stations.forEach(station => {
        const country = station.countrycode || station.country;
        if (country) {
          uniqueCountries.add(country.toLowerCase().trim());
        }
      });
      
      if (uniqueCountries.size > 0) {
        const countriesArray = Array.from(uniqueCountries);
        setStorageItem(StorageKeys.EXPLORED_COUNTRIES, countriesArray);
        this.userStats.countriesExplored = countriesArray.length;
        this.saveUserStats();
        
        console.log(`[AchievementManager] Initialized ${countriesArray.length} countries from existing stations`);
      }
    }
    
    // Only update achievement progress if achievement is not already unlocked
    // This prevents premature unlocking when the app initializes
    const achievement = this.achievements.get('world_explorer');
    if (achievement && !achievement.unlocked) {
      achievement.progress = this.userStats.countriesExplored;
    }
  }

  /**
   * Check listening-based achievements
   */
  private checkListeningAchievements(data?: any): void {
    const currentHour = new Date().getHours();

    // Check time-based achievements
    if (currentHour >= 0 && currentHour < 6) {
      this.updateAchievementProgress('night_owl', 1);
    }

    if (currentHour >= 5 && currentHour < 7) {
      this.updateAchievementProgress('early_bird', 1);
    }

    // Check total listening time
    this.updateAchievementProgress('music_lover', this.userStats.totalPlayTime);
  }

  /**
   * Check social achievements
   */
  private checkSocialAchievements(): void {
    this.updateAchievementProgress('social_listener', 1);
  }

  /**
   * Check technical achievements
   */
  private checkTechnicalAchievements(achievementId: string): void {
    this.updateAchievementProgress(achievementId, 1);
  }


  /**
   * Update achievement progress
   */
  private updateAchievementProgress(achievementId: string, progress: number): void {
    const achievement = this.achievements.get(achievementId);
    if (!achievement || achievement.unlocked) {
      return;
    }

    const previousProgress = achievement.progress || 0;
    achievement.progress = Math.max(previousProgress, progress);

    // Check if achievement should be unlocked
    if (achievement.maxProgress && achievement.progress >= achievement.maxProgress) {
      this.unlockAchievement(achievementId);
    }

    this.saveProgress();
  }

  /**
   * Unlock an achievement
   */
  private unlockAchievement(achievementId: string): void {
    const achievement = this.achievements.get(achievementId);
    if (!achievement || achievement.unlocked) {
      return;
    }

    achievement.unlocked = true;
    achievement.unlockedAt = new Date().toISOString();
    achievement.progress = achievement.maxProgress;

    this.userStats.achievementsUnlocked++;

    // Emit unlock event
    eventManager.emit('achievement:unlocked', achievement);

    this.saveProgress();

    console.log(`[AchievementManager] Achievement unlocked: ${achievement.name}`);
  }


  /**
   * Save progress to storage
   */
  private saveProgress(): void {
    try {
      const achievementsArray = Array.from(this.achievements.values());
      setStorageItem(StorageKeys.ACHIEVEMENTS, achievementsArray);
      setStorageItem(StorageKeys.USER_STATS, this.userStats);
    } catch (error) {
      console.error('[AchievementManager] Failed to save progress:', error);
    }
  }

  /**
   * Save user stats to storage
   */
  private saveUserStats(): void {
    try {
      setStorageItem(StorageKeys.USER_STATS, this.userStats);
    } catch (error) {
      console.error('[AchievementManager] Failed to save user stats:', error);
    }
  }

  /**
   * Reset all achievements
   */
  public resetAllAchievements(): void {
    this.achievements.forEach(achievement => {
      achievement.unlocked = false;
      achievement.progress = 0;
      delete achievement.unlockedAt;
    });

    // Reset all user stats to default values (keep dateJoined)
    const dateJoined = this.userStats.dateJoined;
    this.userStats = this.getDefaultUserStats();
    this.userStats.dateJoined = dateJoined;
    
    // Clear explored countries data to fully reset World Explorer achievement
    setStorageItem(StorageKeys.EXPLORED_COUNTRIES, []);
    
    this.saveProgress();
    this.saveUserStats();

    // Notify other modules that user stats have been reset
    eventManager.emit('user:stats-reset', this.userStats);
    eventManager.emit('achievements:reset-complete');
    console.log('[AchievementManager] All achievements and user stats reset');
  }

  /**
   * Get all achievements
   */
  public getAchievements(): Achievement[] {
    return Array.from(this.achievements.values());
  }

  /**
   * Get achievements by category
   */
  public getAchievementsByCategory(categoryId: string): Achievement[] {
    const category = this.categories.find(cat => cat.id === categoryId);
    return category ? category.achievements : [];
  }

  /**
   * Get all categories
   */
  public getCategories(): AchievementCategory[] {
    return this.categories;
  }

  /**
   * Get achievement progress
   */
  public getAchievementProgress(achievementId: string): AchievementProgress | null {
    const achievement = this.achievements.get(achievementId);
    if (!achievement) {
      return null;
    }

    return {
      achievementId,
      progress: achievement.progress || 0,
      maxProgress: achievement.maxProgress || 1,
      unlocked: achievement.unlocked
    };
  }

  /**
   * Get overall progress stats
   */
  public getProgressStats(): {
    totalAchievements: number;
    unlockedAchievements: number;
    progressPercentage: number;
  } {
    const total = this.achievements.size;
    const unlocked = Array.from(this.achievements.values()).filter(a => a.unlocked).length;

    return {
      totalAchievements: total,
      unlockedAchievements: unlocked,
      progressPercentage: total > 0 ? Math.round((unlocked / total) * 100) : 0
    };
  }

  /**
   * Get user statistics
   */
  public getUserStats(): UserStats {
    return { ...this.userStats };
  }

  /**
   * Update user statistics
   */
  public updateUserStats(updates: Partial<UserStats>): void {
    Object.assign(this.userStats, updates);
    this.saveProgress();
  }

  /**
   * Reload achievement data from storage (public method for external use)
   */
  reloadFromStorage(): void {
    this.loadProgress();
  }

  /**
   * Track specific progress events (for backward compatibility)
   */
  public trackProgress(action: string, value: number = 1, data?: any): void {
    switch (action) {
      case 'stationAdded':
        this.userStats.totalStationsAdded = Math.max(this.userStats.totalStationsAdded, value);
        this.checkAchievements('station:added', data);
        break;
      case 'stationPlayed':
        this.userStats.stationsPlayed += value;
        this.checkAchievements('station:play', data);
        break;
      case 'listeningTime':
        // Note: totalPlayTime is now managed by UserManager through per-station data
        this.checkAchievements('station:play');
        break;
      case 'qrShare':
      case 'urlShare':
        this.checkAchievements('station:share');
        break;
      case 'export':
      case 'import':
        this.checkAchievements('data:' + action);
        break;
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    eventManager.removeAllListeners('achievements:check');
    eventManager.removeAllListeners('achievements:unlock');
    eventManager.removeAllListeners('achievements:reset');
    eventManager.removeAllListeners('station:added');
    eventManager.removeAllListeners('station:play');
    eventManager.removeAllListeners('achievements:request-data');
    
    this.achievements.clear();
    this.categories = [];
  }
}