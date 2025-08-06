/**
 * Profile management module for user preferences and configuration
 */

import { AppSettings, AppEventType } from '@/types/app';
import { eventManager } from '@/utils/events';
import { getStorageItem, setStorageItem, StorageKeys, exportStationsData, importStationsWithMerge, clearAllStorage } from '@/utils/storage';

export interface ProfileManagerConfig {
  // Configuration options can be added here as needed
}

/**
 * Manages application settings and user preferences
 */
export class ProfileManager {
  private settings!: AppSettings;
  private eventListeners: Map<AppEventType, (payload: any) => void> = new Map();

  constructor(_config: ProfileManagerConfig = {}) {
    this.loadSettings();
    this.setupEventListeners();
  }

  /**
   * Load settings from storage with defaults
   */
  private loadSettings(): void {
    this.settings = getStorageItem(StorageKeys.SETTINGS, {});

    // Apply settings immediately
    this.applySettings();
    eventManager.emit('settings:loaded', this.settings);
  }


  /**
   * Save settings to storage
   */
  private saveSettings(): void {
    setStorageItem(StorageKeys.SETTINGS, this.settings);
    eventManager.emit('settings:saved', this.settings);
  }

  /**
   * Apply settings to the application
   */
  private applySettings(): void {
    eventManager.emit('settings:applied', this.settings);
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    const updateListener = (updates: Partial<AppSettings>) => {
      this.updateSettings(updates);
    };
    const resetListener = () => {
      this.resetToDefaults();
    };
    const exportListener = () => {
      this.exportStationData();
    };
    const importListener = (data: string) => {
      this.importStationData(data);
    };

    eventManager.on('settings:update', updateListener);
    eventManager.on('settings:reset', resetListener);
    eventManager.on('settings:export', exportListener);
    eventManager.on('settings:import', importListener);

    // Store references for cleanup
    this.eventListeners.set('settings:update', updateListener);
    this.eventListeners.set('settings:reset', resetListener);
    this.eventListeners.set('settings:export', exportListener);
    this.eventListeners.set('settings:import', importListener);
  }


  /**
   * Update settings
   */
  updateSettings(updates: Partial<AppSettings>): void {
    const oldSettings = { ...this.settings };
    this.settings = { ...this.settings, ...updates };
    
    this.saveSettings();
    this.applySettings();
    
    eventManager.emit('settings:changed', {
      oldSettings,
      newSettings: this.settings,
      changes: updates
    });
  }

  /**
   * Get current settings
   */
  getSettings(): AppSettings {
    return { ...this.settings };
  }

  /**
   * Get a specific setting
   */
  getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return this.settings[key];
  }

  /**
   * Set a specific setting
   */
  setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    this.updateSettings({ [key]: value } as Partial<AppSettings>);
  }

  /**
   * Toggle a boolean setting
   */
  toggleSetting(key: keyof AppSettings): boolean {
    const currentValue = this.settings[key];
    if (typeof currentValue === 'boolean') {
      const newValue = !currentValue;
      this.updateSettings({ [key]: newValue } as Partial<AppSettings>);
      return newValue;
    }
    return false;
  }

  /**
   * Reset settings to defaults
   */
  resetToDefaults(): void {
    const defaultSettings: AppSettings = {};

    this.settings = defaultSettings;
    this.saveSettings();
    this.applySettings();
    
    eventManager.emit('settings:reset', this.settings);
  }

  /**
   * Export all station data
   */
  exportStationData(): string {
    const data = exportStationsData();
    eventManager.emit('settings:exported', data);
    return data;
  }

  /**
   * Import station data only (excludes user stats and achievements)
   */
  importStationData(jsonData: string, mergeMode: boolean = false): boolean {
    try {
      const success = importStationsWithMerge(jsonData, mergeMode);
      if (success) {
        // Note: We don't reload settings since we're only importing stations
        eventManager.emit('settings:imported', this.settings);
      }
      return success;
    } catch (error) {
      console.error('Failed to import station data:', error);
      eventManager.emit('settings:import-error', error);
      return false;
    }
  }

  /**
   * Clear all application data
   */
  clearAllData(): boolean {
    try {
      const success = clearAllStorage();
      if (success) {
        this.resetToDefaults();
        eventManager.emit('settings:data-cleared');
      }
      return success;
    } catch (error) {
      console.error('Failed to clear data:', error);
      return false;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Remove only the specific listeners this instance added
    this.eventListeners.forEach((listener, eventType) => {
      eventManager.off(eventType, listener);
    });
    this.eventListeners.clear();
  }
}