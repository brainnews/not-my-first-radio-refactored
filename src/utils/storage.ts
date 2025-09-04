/**
 * Local storage utility functions with type safety and error handling
 */

/**
 * Storage keys enum for consistency
 */
export enum StorageKeys {
  STATIONS = 'radioStations',
  USERNAME = 'radioUsername',
  SETTINGS = 'radioSettings',
  ACHIEVEMENTS = 'radioAchievements',
  USER_STATS = 'userStats',
  LAST_PLAYED = 'lastPlayedStation',
  VOLUME = 'radioVolume',
  SECTION_STATES = 'sectionStates',
  EXPLORED_COUNTRIES = 'exploredCountries',
  STATION_SORT_PREFERENCE = 'stationSortPreference',
  SEARCH_SORT_PREFERENCE = 'searchSortPreference',
  STATION_LISTENING_TIMES = 'stationListeningTimes'
}

/**
 * Get item from localStorage with type safety
 */
export function getStorageItem<T>(key: StorageKeys, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }
    return JSON.parse(item) as T;
  } catch (error) {
    console.warn(`Failed to parse localStorage item '${key}':`, error);
    return defaultValue;
  }
}

/**
 * Set item in localStorage with error handling
 */
export function setStorageItem<T>(key: StorageKeys, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Failed to save to localStorage '${key}':`, error);
    return false;
  }
}

/**
 * Remove item from localStorage
 */
export function removeStorageItem(key: StorageKeys): boolean {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Failed to remove from localStorage '${key}':`, error);
    return false;
  }
}

/**
 * Clear all application data from localStorage
 */
export function clearAllStorage(): boolean {
  try {
    Object.values(StorageKeys).forEach(key => {
      localStorage.removeItem(key);
    });
    return true;
  } catch (error) {
    console.error('Failed to clear localStorage:', error);
    return false;
  }
}

/**
 * Check if localStorage is available
 */
export function isStorageAvailable(): boolean {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get storage usage information
 */
export function getStorageUsage(): {
  used: number;
  available: number;
  percentage: number;
} {
  try {
    let used = 0;
    Object.values(StorageKeys).forEach(key => {
      const item = localStorage.getItem(key);
      if (item) {
        used += item.length;
      }
    });

    // Rough estimate of localStorage limit (usually 5-10MB)
    const available = 5 * 1024 * 1024; // 5MB
    const percentage = (used / available) * 100;

    return { used, available, percentage };
  } catch {
    return { used: 0, available: 0, percentage: 0 };
  }
}

/**
 * Export all application data
 */
export function exportAllData(): string {
  const data: Record<string, any> = {};
  
  Object.values(StorageKeys).forEach(key => {
    const item = localStorage.getItem(key);
    if (item) {
      try {
        data[key] = JSON.parse(item);
      } catch {
        data[key] = item;
      }
    }
  });

  return JSON.stringify(data, null, 2);
}

/**
 * Export stations data without achievements
 */
export function exportStationsData(): string {
  const data: Record<string, any> = {};
  
  // Export all data except achievements
  const keysToExport = Object.values(StorageKeys).filter(key => key !== StorageKeys.ACHIEVEMENTS);
  
  keysToExport.forEach(key => {
    const item = localStorage.getItem(key);
    if (item) {
      try {
        data[key] = JSON.parse(item);
      } catch {
        data[key] = item;
      }
    }
  });

  return JSON.stringify(data, null, 2);
}

/**
 * Import application data from JSON string
 */
export function importAllData(jsonData: string): boolean {
  try {
    const data = JSON.parse(jsonData);
    
    Object.entries(data).forEach(([key, value]) => {
      if (Object.values(StorageKeys).includes(key as StorageKeys)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    });
    
    return true;
  } catch (error) {
    console.error('Failed to import data:', error);
    return false;
  }
}

/**
 * Import only station data from JSON (excludes user stats and achievements)
 */
export function importStationsOnly(jsonData: string): boolean {
  try {
    const data = JSON.parse(jsonData);
    
    // Only import stations
    const importKeys = [StorageKeys.STATIONS];
    
    Object.entries(data).forEach(([key, value]) => {
      if (importKeys.includes(key as StorageKeys)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    });
    
    return true;
  } catch (error) {
    console.error('Failed to import station data:', error);
    return false;
  }
}

/**
 * Import station data with merge option (prevents duplicates)
 */
export function importStationsWithMerge(jsonData: string, mergeMode: boolean = false): boolean {
  try {
    const data = JSON.parse(jsonData);
    
    if (!mergeMode) {
      // Overwrite mode - use existing function
      return importStationsOnly(jsonData);
    }
    
    // Merge mode - combine with existing stations
    const existingStations = getStorageItem<any[]>(StorageKeys.STATIONS, []);
    
    // Get import data
    const importStations = data[StorageKeys.STATIONS] || [];
    
    // Merge stations - check for duplicates by stationuuid
    const mergedStations = [...existingStations];
    const existingIds = new Set(existingStations.map((station: any) => station.stationuuid));
    
    importStations.forEach((station: any) => {
      if (station.stationuuid && !existingIds.has(station.stationuuid)) {
        mergedStations.push(station);
        existingIds.add(station.stationuuid);
      }
    });
    
    // Save merged data
    setStorageItem(StorageKeys.STATIONS, mergedStations);
    
    return true;
  } catch (error) {
    console.error('Failed to import station data with merge:', error);
    return false;
  }
}

/**
 * Storage event listener for cross-tab synchronization
 */
export function onStorageChange(
  key: StorageKeys,
  callback: (newValue: any, oldValue: any) => void
): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key === key) {
      let newValue = null;
      let oldValue = null;
      
      try {
        if (event.newValue) newValue = JSON.parse(event.newValue);
        if (event.oldValue) oldValue = JSON.parse(event.oldValue);
      } catch {
        newValue = event.newValue;
        oldValue = event.oldValue;
      }
      
      callback(newValue, oldValue);
    }
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/**
 * Migrate old storage format to new format
 */
export function migrateStorage(): void {
  // Migration logic for old versions - fix storage keys to match original version
  const oldStationsKey = 'radio-stations';
  const oldUsernameKey = 'radio-username';
  
  if (localStorage.getItem(oldStationsKey) && !localStorage.getItem(StorageKeys.STATIONS)) {
    localStorage.setItem(StorageKeys.STATIONS, localStorage.getItem(oldStationsKey)!);
    localStorage.removeItem(oldStationsKey);
  }
  
  if (localStorage.getItem(oldUsernameKey) && !localStorage.getItem(StorageKeys.USERNAME)) {
    localStorage.setItem(StorageKeys.USERNAME, localStorage.getItem(oldUsernameKey)!);
    localStorage.removeItem(oldUsernameKey);
  }
  
}