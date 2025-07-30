/**
 * Station management module for CRUD operations and display logic
 */

import { LocalStation, RadioStation, StationListeningTimes } from '@/types/station';
import { eventManager } from '@/utils/events';
import { getStorageItem, setStorageItem, StorageKeys } from '@/utils/storage';
import { querySelector, createElement, debounce } from '@/utils/dom';
import { sharingService } from '@/services/sharing/SharingService';
import { getCountryIcon, getVotesIcon, getBitrateIcon, createStationInitialsImage } from '@/utils/icons';

export interface StationManagerConfig {
  container?: HTMLElement;
  autoSave?: boolean;
  maxStations?: number;
}

/**
 * Station sorting options
 */
export enum StationSortOption {
  RECENTLY_PLAYED = 'recently-played',
  A_TO_Z = 'a-to-z',
  Z_TO_A = 'z-to-a',
  DATE_ADDED_NEWEST = 'date-added-newest',
  DATE_ADDED_OLDEST = 'date-added-oldest',
  MOST_LISTENED = 'most-listened',
  LEAST_LISTENED = 'least-listened',
  COUNTRY = 'country',
  BITRATE_HIGHEST = 'bitrate-highest',
  VOTES_HIGHEST = 'votes-highest'
}

/**
 * Station sort configuration
 */
export interface StationSortConfig {
  option: StationSortOption;
  label: string;
}

/**
 * Available station sorting configurations
 */
export const STATION_SORT_OPTIONS: StationSortConfig[] = [
  { option: StationSortOption.RECENTLY_PLAYED, label: 'Recently played' },
  { option: StationSortOption.A_TO_Z, label: 'A to Z' },
  { option: StationSortOption.Z_TO_A, label: 'Z to A' },
  { option: StationSortOption.DATE_ADDED_NEWEST, label: 'Date added (newest)' },
  { option: StationSortOption.DATE_ADDED_OLDEST, label: 'Date added (oldest)' },
  { option: StationSortOption.MOST_LISTENED, label: 'Most listened' },
  { option: StationSortOption.LEAST_LISTENED, label: 'Least listened' },
  { option: StationSortOption.COUNTRY, label: 'Country' },
  { option: StationSortOption.BITRATE_HIGHEST, label: 'Bitrate (highest)' },
  { option: StationSortOption.VOTES_HIGHEST, label: 'Votes (highest)' }
];

/**
 * Validates a favicon URL to prevent loading malformed URLs
 */
function isValidFaviconUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const parsedUrl = new URL(url);
    // Check for basic URL structure and common image extensions
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Manages user stations and station display
 */
export class StationManager {
  private stations: LocalStation[] = [];
  private container: HTMLElement;
  private autoSave: boolean;
  private maxStations: number;
  private currentPlayingStation: LocalStation | null = null;
  private isCurrentlyPlaying: boolean = false;
  private currentSortOption: StationSortOption = StationSortOption.RECENTLY_PLAYED;
  private filterQuery: string = '';
  private debouncedFilter: (query: string) => void;
  private debouncedFilterInContainer: (container: HTMLElement) => void;
  private delegationContext: string | null = null;

  constructor(config: StationManagerConfig = {}) {
    this.container = config.container || querySelector('#stations');
    this.autoSave = config.autoSave ?? true;
    this.maxStations = config.maxStations || 1000;

    // Initialize debounced filter
    this.debouncedFilter = debounce(this.applyFilter.bind(this), 300);
    this.debouncedFilterInContainer = debounce(this.applyFilterInContainer.bind(this), 300);

    this.loadSortPreference();
    this.loadStations();
    this.migratePinnedToPresets();
    this.setupEventListeners();
  }

  /**
   * Load stations from storage
   */
  private loadStations(): void {
    this.stations = getStorageItem(StorageKeys.STATIONS, []);
    this.migrateOldStations();
    this.updateStationsWithListeningTimes();
    eventManager.emit('stations:loaded', this.stations);
  }

  /**
   * Reload stations from storage (public method for external use)
   */
  reloadStationsFromStorage(): void {
    this.stations = getStorageItem(StorageKeys.STATIONS, []);
    this.migrateOldStations();
    this.updateStationsWithListeningTimes();
    eventManager.emit('stations:loaded', this.stations);
  }


  /**
   * Migrate old station format if needed
   */
  private migrateOldStations(): void {
    let needsMigration = false;

    this.stations = this.stations.map(station => {
      if (!station.id) {
        station.id = station.stationuuid || this.generateStationId();
        needsMigration = true;
      }
      if (!station.dateAdded) {
        station.dateAdded = new Date().toISOString();
        needsMigration = true;
      }
      if (station.playCount === undefined) {
        station.playCount = 0;
        needsMigration = true;
      }
      if (station.isFavorite === undefined) {
        station.isFavorite = false;
        needsMigration = true;
      }
      return station;
    });

    if (needsMigration && this.autoSave) {
      this.saveStations();
    }
  }

  /**
   * Migrate pinned stations to preset system
   */
  private migratePinnedToPresets(): void {
    // Check if migration has already been done
    const migrationKey = 'pinned-to-presets-migration-v1';
    const migrationDone = getStorageItem(migrationKey, false);
    
    if (migrationDone) {
      return;
    }

    let migrationCount = 0;
    const pinnedStations = this.stations.filter(s => s.isFavorite && !s.presetSlot);
    
    if (pinnedStations.length > 0) {
      // Convert first 6 pinned stations to presets
      pinnedStations.slice(0, 6).forEach((station, index) => {
        station.presetSlot = index + 1;
        migrationCount++;
      });
      
      this.saveStations();
      
      // Show notification about migration
      if (migrationCount > 0) {
        eventManager.emit('notification:show', {
          type: 'info',
          message: `Migrated ${migrationCount} pinned station${migrationCount > 1 ? 's' : ''} to presets`,
          duration: 5000
        });
        
        console.log(`[StationManager] Migrated ${migrationCount} pinned stations to presets`);
      }
    }
    
    // Mark migration as complete
    setStorageItem(migrationKey, true);
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    eventManager.on('station:remove', (stationId: string) => {
      this.removeStation(stationId);
    });

    eventManager.on('station:remove-by-uuid', (stationUuid: string) => {
      this.removeStationByUuid(stationUuid);
    });

    eventManager.on('station:update', (station: LocalStation) => {
      this.updateStation(station);
    });

    eventManager.on('stations:clear', () => {
      this.clearStations();
    });

    // Handle requests for current library stations
    eventManager.on('library:get-stations', () => {
      eventManager.emit('library:stations-response', this.stations);
    });

    // Listen for player state changes to update UI
    eventManager.on('station:selected', (station: LocalStation) => {
      this.currentPlayingStation = station;
      this.updatePlayingStationUI();
    });

    eventManager.on('station:play', (station: LocalStation) => {
      this.currentPlayingStation = station;
      this.isCurrentlyPlaying = true;
      
      // Update station metadata for play tracking
      const localStation = this.stations.find(s => s.stationuuid === station.stationuuid);
      if (localStation) {
        localStation.playCount = (localStation.playCount || 0) + 1;
        localStation.lastPlayedAt = new Date().toISOString();
        this.saveStations();
        
        // Re-render to update UI
        this.renderInCurrentContext();
      }
      
      this.updatePlayingStationUI();
    });

    eventManager.on('station:pause', () => {
      this.isCurrentlyPlaying = false;
      this.updatePlayingStationUI();
    });

    eventManager.on('station:stop', () => {
      this.currentPlayingStation = null;
      this.isCurrentlyPlaying = false;
      this.updatePlayingStationUI();
    });

    eventManager.on('stations:import', (stations: LocalStation[]) => {
      this.importStations(stations);
    });

    eventManager.on('stations:import-merge', (stations: LocalStation[]) => {
      this.importStations(stations, true);
    });

    eventManager.on('stations:display', () => {
      this.renderStations();
    });

    // Listen for LibraryView requesting station rendering
    eventManager.on('library:render-stations', (data: { containerId: string }) => {
      this.renderStationsInContainer(data.containerId);
    });

    // Listen for LibraryView requesting preset rendering
    eventManager.on('library:render-presets', (data: { containerId: string }) => {
      this.renderPresetsInContainer(data.containerId);
    });

    // Listen for sort changes (e.g., after starter pack import)
    eventManager.on('library:sort-change', (sortOption: string) => {
      if (sortOption === 'date-added-newest') {
        this.setSortOption(StationSortOption.DATE_ADDED_NEWEST);
      }
    });

    // Listen for per-station listening time updates
    eventManager.on('player:listening-time', (data: { totalTime: number, station: LocalStation }) => {
      this.updateStationListeningTime(data.station, data.totalTime);
    });

  }


  /**
   * Generate unique station ID
   */
  private generateStationId(): string {
    return `station_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Save stations to storage
   */
  private saveStations(): void {
    if (this.autoSave) {
      setStorageItem(StorageKeys.STATIONS, this.stations);
      eventManager.emit('stations:saved', this.stations);
    }
  }

  /**
   * Update station listening time
   */
  private updateStationListeningTime(station: LocalStation, timeMs: number): void {
    const listeningTimes = getStorageItem<StationListeningTimes>(StorageKeys.STATION_LISTENING_TIMES, {});
    
    if (!listeningTimes[station.stationuuid]) {
      listeningTimes[station.stationuuid] = {
        totalTime: 0,
        sessionCount: 0
      };
    }
    
    listeningTimes[station.stationuuid].totalTime += timeMs;
    
    setStorageItem(StorageKeys.STATION_LISTENING_TIMES, listeningTimes);
    
    // Update totalListeningTime on all stations for sorting
    this.updateStationsWithListeningTimes();
  }

  /**
   * Update all stations with their listening time data
   */
  private updateStationsWithListeningTimes(): void {
    const listeningTimes = getStorageItem<StationListeningTimes>(StorageKeys.STATION_LISTENING_TIMES, {});
    
    this.stations.forEach(station => {
      const timeData = listeningTimes[station.stationuuid];
      station.totalListeningTime = timeData ? timeData.totalTime : 0;
    });
  }


  /**
   * Add a new station
   */
  addStation(radioStation: RadioStation): LocalStation {
    // Check if station already exists
    const existingStation = this.stations.find(s => s.stationuuid === radioStation.stationuuid);
    if (existingStation) {
      throw new Error('Station already exists');
    }

    // Check station limit
    if (this.stations.length >= this.maxStations) {
      throw new Error(`Maximum number of stations (${this.maxStations}) reached`);
    }

    // Create local station
    const localStation: LocalStation = {
      ...radioStation,
      id: this.generateStationId(),
      dateAdded: new Date().toISOString(),
      playCount: 0,
      isFavorite: false
    };

    this.stations.unshift(localStation);
    this.saveStations();
    
    // Re-render the UI to show the new station immediately
    this.renderInCurrentContext();
    
    eventManager.emit('station:added', localStation);
    return localStation;
  }

  /**
   * Remove a station
   */
  removeStation(stationId: string): boolean {
    const index = this.stations.findIndex(s => s.id === stationId);
    if (index === -1) {
      return false;
    }

    const removedStation = this.stations.splice(index, 1)[0];
    this.saveStations();
    
    // Re-render the UI to remove the station immediately
    this.renderInCurrentContext();
    
    eventManager.emit('station:removed', removedStation);
    return true;
  }

  /**
   * Remove a station by UUID
   */
  removeStationByUuid(stationUuid: string): boolean {
    const station = this.getStationByUuid(stationUuid);
    if (!station) {
      return false;
    }
    
    return this.removeStation(station.id);
  }

  /**
   * Update station metadata
   */
  updateStation(updatedStation: Partial<LocalStation> & { id: string }): boolean {
    const index = this.stations.findIndex(s => s.id === updatedStation.id);
    if (index === -1) {
      return false;
    }

    this.stations[index] = { ...this.stations[index], ...updatedStation };
    this.saveStations();
    
    // Re-render the UI to show the updated station immediately
    this.renderInCurrentContext();
    
    eventManager.emit('station:updated', this.stations[index]);
    return true;
  }

  /**
   * Get station by ID
   */
  getStation(stationId: string): LocalStation | null {
    return this.stations.find(s => s.id === stationId) || null;
  }

  /**
   * Get station by UUID
   */
  getStationByUuid(uuid: string): LocalStation | null {
    return this.stations.find(s => s.stationuuid === uuid) || null;
  }

  /**
   * Get all stations
   */
  getAllStations(): LocalStation[] {
    return [...this.stations];
  }


  /**
   * Get preset stations (1-6)
   */
  getPresets(): LocalStation[] {
    return this.stations
      .filter(s => s.presetSlot !== undefined)
      .sort((a, b) => (a.presetSlot || 0) - (b.presetSlot || 0));
  }

  /**
   * Get station by preset slot
   */
  getPresetBySlot(slot: number): LocalStation | null {
    if (slot < 1 || slot > 6) return null;
    return this.stations.find(s => s.presetSlot === slot) || null;
  }

  /**
   * Get available preset slots (1-6)
   */
  getAvailablePresetSlots(): number[] {
    const usedSlots = this.stations
      .filter(s => s.presetSlot !== undefined)
      .map(s => s.presetSlot!);
    
    return [1, 2, 3, 4, 5, 6].filter(slot => !usedSlots.includes(slot));
  }

  /**
   * Set station as preset in specific slot
   */
  setPreset(stationId: string, slot: number): boolean {
    if (slot < 1 || slot > 6) return false;
    
    const station = this.getStation(stationId);
    if (!station) return false;

    // Remove any existing preset from this slot
    this.removePreset(slot);
    
    // Remove station from any other preset slot
    this.removeStationFromPresets(stationId);
    
    // Set the new preset
    station.presetSlot = slot;
    this.saveStations();
    this.renderInCurrentContext();
    
    eventManager.emit('preset:set', { station, slot });
    return true;
  }

  /**
   * Remove preset from slot
   */
  removePreset(slot: number): boolean {
    if (slot < 1 || slot > 6) return false;
    
    const station = this.getPresetBySlot(slot);
    if (!station) return false;
    
    station.presetSlot = undefined;
    this.saveStations();
    this.renderInCurrentContext();
    
    eventManager.emit('preset:removed', { station, slot });
    return true;
  }

  /**
   * Remove station from all preset slots
   */
  private removeStationFromPresets(stationId: string): void {
    const station = this.getStation(stationId);
    if (station && station.presetSlot !== undefined) {
      station.presetSlot = undefined;
    }
  }

  /**
   * Add station to next available preset slot
   */
  addToPresets(stationId: string): number | null {
    const availableSlots = this.getAvailablePresetSlots();
    if (availableSlots.length === 0) return null;
    
    const slot = availableSlots[0];
    return this.setPreset(stationId, slot) ? slot : null;
  }


  /**
   * Load sort preference from storage
   */
  private loadSortPreference(): void {
    this.currentSortOption = getStorageItem(StorageKeys.STATION_SORT_PREFERENCE, StationSortOption.RECENTLY_PLAYED);
  }

  /**
   * Save sort preference to storage
   */
  private saveSortPreference(): void {
    setStorageItem(StorageKeys.STATION_SORT_PREFERENCE, this.currentSortOption);
  }

  /**
   * Set current sort option and re-render
   */
  setSortOption(option: StationSortOption): void {
    this.currentSortOption = option;
    this.saveSortPreference();
    this.renderInCurrentContext();
  }

  /**
   * Sort stations based on current sort option
   */
  private sortStations(stations: LocalStation[]): LocalStation[] {
    const sortedStations = [...stations];

    switch (this.currentSortOption) {

      case StationSortOption.RECENTLY_PLAYED:
        return sortedStations.sort((a, b) => {
          const timeA = a.lastPlayedAt ? new Date(a.lastPlayedAt).getTime() : 0;
          const timeB = b.lastPlayedAt ? new Date(b.lastPlayedAt).getTime() : 0;
          return timeB - timeA; // Most recent first
        });

      case StationSortOption.A_TO_Z:
        return sortedStations.sort((a, b) => 
          (a.customName || a.name).toLowerCase().localeCompare((b.customName || b.name).toLowerCase())
        );

      case StationSortOption.Z_TO_A:
        return sortedStations.sort((a, b) => 
          (b.customName || b.name).toLowerCase().localeCompare((a.customName || a.name).toLowerCase())
        );

      case StationSortOption.DATE_ADDED_NEWEST:
        return sortedStations.sort((a, b) => 
          new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
        );

      case StationSortOption.DATE_ADDED_OLDEST:
        return sortedStations.sort((a, b) => 
          new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime()
        );

      case StationSortOption.MOST_LISTENED:
        return sortedStations.sort((a, b) => (b.totalListeningTime || 0) - (a.totalListeningTime || 0));

      case StationSortOption.LEAST_LISTENED:
        return sortedStations.sort((a, b) => (a.totalListeningTime || 0) - (b.totalListeningTime || 0));

      case StationSortOption.COUNTRY:
        return sortedStations.sort((a, b) => {
          const countryA = a.country || '';
          const countryB = b.country || '';
          return countryA.toLowerCase().localeCompare(countryB.toLowerCase());
        });

      case StationSortOption.BITRATE_HIGHEST:
        return sortedStations.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

      case StationSortOption.VOTES_HIGHEST:
        return sortedStations.sort((a, b) => (b.votes || 0) - (a.votes || 0));

      default:
        return sortedStations;
    }
  }

  /**
   * Get most played stations
   */
  getMostPlayed(limit = 10): LocalStation[] {
    return this.stations
      .filter(s => s.playCount > 0)
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, limit);
  }

  /**
   * Search stations by name or country
   */
  searchStations(query: string): LocalStation[] {
    const lowercaseQuery = query.toLowerCase();
    return this.stations.filter(station =>
      station.name.toLowerCase().includes(lowercaseQuery) ||
      station.country?.toLowerCase().includes(lowercaseQuery) ||
      station.tags?.toLowerCase().includes(lowercaseQuery)
    );
  }


  /**
   * Update station note
   */
  updateStationNote(stationId: string, note: string): boolean {
    const station = this.getStation(stationId);
    if (!station) {
      return false;
    }

    station.note = note || undefined;
    this.saveStations();
    
    // Re-render the UI to show the updated note immediately
    this.renderStations();
    
    eventManager.emit('station:note-updated', station);
    return true;
  }

  /**
   * Clear all stations
   */
  clearStations(): void {
    this.stations = [];
    this.saveStations();
    
    // Re-render the UI to show empty state immediately
    this.renderStations();
    
    eventManager.emit('stations:cleared');
  }

  /**
   * Import stations from array
   */
  importStations(newStations: LocalStation[], mergeMode = false): number {
    let importedCount = 0;

    if (!mergeMode) {
      this.stations = [];
    }

    newStations.forEach(station => {
      try {
        // Ensure station has required fields
        if (!station.id) {
          station.id = this.generateStationId();
        }
        if (!station.dateAdded) {
          station.dateAdded = new Date().toISOString();
        }

        // Check for duplicates
        const exists = this.stations.some(s => s.stationuuid === station.stationuuid);
        if (!exists && this.stations.length < this.maxStations) {
          this.stations.push(station);
          importedCount++;
        }
      } catch (error) {
        console.warn('Failed to import station:', station.name, error);
      }
    });

    this.saveStations();
    
    // Re-render the UI to show imported stations immediately
    this.renderStations();
    
    eventManager.emit('stations:imported', { count: importedCount, total: newStations.length });
    
    return importedCount;
  }

  /**
   * Export stations to JSON
   */
  exportStations(): string {
    return JSON.stringify(this.stations, null, 2);
  }

  /**
   * Filter stations by name
   */
  private filterStations(stations: LocalStation[]): LocalStation[] {
    if (!this.filterQuery.trim()) {
      return stations;
    }

    const query = this.filterQuery.toLowerCase().trim();
    return stations.filter(station => 
      station.name.toLowerCase().includes(query) ||
      (station.customName && station.customName.toLowerCase().includes(query))
    );
  }

  /**
   * Apply filter and re-render stations while preserving focus
   */
  private applyFilter(): void {
    // Store the currently focused element
    const activeElement = document.activeElement as HTMLElement;
    const isFilterInput = activeElement?.classList.contains('filter-input');
    const cursorPosition = isFilterInput ? (activeElement as HTMLInputElement).selectionStart : null;
    
    // Only re-render the stations grid, not the entire stations section
    this.renderStationsGrid();
    
    // Restore focus to filter input if it was previously focused
    if (isFilterInput) {
      // Use a short timeout to ensure DOM is updated
      setTimeout(() => {
        const filterInput = this.container.querySelector('.filter-input') as HTMLInputElement;
        if (filterInput) {
          filterInput.focus();
          if (cursorPosition !== null) {
            filterInput.setSelectionRange(cursorPosition, cursorPosition);
          }
        }
      }, 0);
    }
  }

  /**
   * Apply filter within a specific container
   */
  private applyFilterInContainer(container: HTMLElement): void {
    const stationsGrid = container.querySelector('.stations-grid');
    if (stationsGrid) {
      const filteredStations = this.filterStations(this.stations);
      const sortedStations = this.sortStations(filteredStations);
      this.updateStationsGrid(stationsGrid as HTMLElement, sortedStations);
    }
  }

  /**
   * Update stations grid content
   */
  private updateStationsGrid(stationsGrid: HTMLElement, stations: LocalStation[]): void {
    // Clear and rebuild only the grid content
    stationsGrid.innerHTML = '';

    const hasFilter = this.filterQuery.trim().length > 0;
    
    if (stations.length === 0 && hasFilter) {
      // Show "no results" message when filter returns no stations
      const noResults = createElement('div', { className: 'filter-no-results' });
      noResults.innerHTML = `
        <p>No stations match "${this.filterQuery}"</p>
        <button class="clear-filter-link">Clear filter</button>
      `;
      
      const clearLink = noResults.querySelector('.clear-filter-link') as HTMLButtonElement;
      clearLink.addEventListener('click', () => {
        this.filterQuery = '';
        const filterInput = stationsGrid.closest('.station-section')?.querySelector('.filter-input') as HTMLInputElement;
        if (filterInput) {
          filterInput.value = '';
          filterInput.focus();
        }
        // Re-update the grid
        const filteredStations = this.filterStations(this.stations);
        const sortedStations = this.sortStations(filteredStations);
        this.updateStationsGrid(stationsGrid, sortedStations);
      });
      
      stationsGrid.appendChild(noResults);
    } else {
      stations.forEach(station => {
        const stationCard = this.createStationCard(station);
        stationsGrid.appendChild(stationCard);
      });
    }
  }

  /**
   * Set filter query and trigger filtering
   */
  setFilter(query: string): void {
    this.filterQuery = query;
    this.debouncedFilter(query);
  }

  /**
   * Clear filter and show all stations
   */
  clearFilter(): void {
    this.filterQuery = '';
    this.renderStationsGrid();
  }

  /**
   * Render only the stations grid without recreating the entire section
   */
  private renderStationsGrid(): void {
    const existingStationsGrid = this.container.querySelector('.stations-grid');
    if (!existingStationsGrid) {
      // Fallback to full render if grid doesn't exist
      this.renderStations();
      return;
    }

    // Filter and sort stations
    const filteredStations = this.filterStations(this.stations);
    const sortedStations = this.sortStations(filteredStations);
    
    // Clear and rebuild only the grid content
    existingStationsGrid.innerHTML = '';

    const hasFilter = this.filterQuery.trim().length > 0;
    
    if (sortedStations.length === 0 && hasFilter) {
      // Show "no results" message when filter returns no stations
      const noResults = createElement('div', { className: 'filter-no-results' });
      noResults.innerHTML = `
        <p>No stations match "${this.filterQuery}"</p>
        <button class="clear-filter-link">Clear filter</button>
      `;
      
      const clearLink = noResults.querySelector('.clear-filter-link') as HTMLButtonElement;
      clearLink.addEventListener('click', () => {
        this.clearFilter();
        const filterInput = this.container.querySelector('.filter-input') as HTMLInputElement;
        if (filterInput) {
          filterInput.value = '';
          filterInput.focus();
        }
      });
      
      existingStationsGrid.appendChild(noResults);
    } else {
      sortedStations.forEach(station => {
        const stationCard = this.createStationCard(station);
        existingStationsGrid.appendChild(stationCard);
      });
    }
  }

  /**
   * Render in the current context (main view or delegated container)
   */
  private renderInCurrentContext(): void {
    // Check if we're currently rendering in the LibraryView container
    const libraryContainer = document.getElementById('library-stations-container');
    if (libraryContainer && this.container === libraryContainer) {
      // We're in LibraryView context, re-render there
      this.renderStationsInContainer('library-stations-container');
    } else {
      // Normal rendering to main container
      this.renderStations();
    }
    
    // Update existing preset grids without full recreation
    this.updateExistingPresetGrids();
  }

  /**
   * Render stations in the container
   */
  renderStations(): void {
    if (!this.container) {
      return;
    }

    this.container.innerHTML = '';

    if (this.stations.length === 0) {
      this.renderEmptyState();
      return;
    }

    // Create sections
    this.renderPresetsSection();
    
    // Filter and sort all stations based on current filter and sort option
    const filteredStations = this.filterStations(this.stations);
    const sortedStations = this.sortStations(filteredStations);
    
    this.renderStationSectionWithSort('All Stations', sortedStations);
  }

  /**
   * Render stations in a specific container (for LibraryView)
   */
  renderStationsInContainer(containerId: string): void {
    const targetContainer = querySelector(`#${containerId}`) as HTMLElement;
    if (!targetContainer) {
      console.warn(`[StationManager] Container #${containerId} not found`);
      return;
    }

    // Set delegation context and temporarily switch container
    this.delegationContext = containerId;
    const originalContainer = this.container;
    this.container = targetContainer;

    if (this.stations.length === 0) {
      this.renderEmptyState();
    } else {
      // Filter and sort all stations based on current filter and sort option
      const filteredStations = this.filterStations(this.stations);
      const sortedStations = this.sortStations(filteredStations);
      
      // Render with sorting and filtering controls
      this.renderStationSectionWithSort('All Stations', sortedStations);
    }

    // Restore original container and clear delegation context
    this.container = originalContainer;
    this.delegationContext = null;
  }

  /**
   * Render presets in a specific container (for LibraryView)
   */
  renderPresetsInContainer(containerId: string): void {
    const targetContainer = querySelector(`#${containerId}`) as HTMLElement;
    if (!targetContainer) {
      console.warn(`[StationManager] Container #${containerId} not found`);
      return;
    }

    // Temporarily switch container
    const originalContainer = this.container;
    this.container = targetContainer;

    // Always render presets section (shows empty slots even if no presets exist)
    this.renderPresetsSection();

    // Restore original container
    this.container = originalContainer;
  }

  /**
   * Update existing preset grids without full recreation
   */
  private updateExistingPresetGrids(): void {
    const presets = this.getPresets();
    const allSlots = [1, 2, 3, 4, 5, 6];
    
    // Update main container presets if they exist
    const mainPresetsGrid = this.container?.querySelector('.presets-grid');
    if (mainPresetsGrid) {
      this.updatePresetGrid(mainPresetsGrid as HTMLElement, presets, allSlots);
    }
    
    // Update LibraryView presets if they exist
    const libraryPresetsContainer = document.getElementById('library-presets-container');
    if (libraryPresetsContainer) {
      const libraryPresetsGrid = libraryPresetsContainer.querySelector('.presets-grid');
      if (libraryPresetsGrid) {
        this.updatePresetGrid(libraryPresetsGrid as HTMLElement, presets, allSlots);
      }
    }
  }

  /**
   * Update a specific preset grid with current preset data
   */
  private updatePresetGrid(presetsGrid: HTMLElement, presets: LocalStation[], allSlots: number[]): void {
    // Get all existing preset tiles
    const existingTiles = presetsGrid.querySelectorAll('.preset-tile');
    
    allSlots.forEach((slot, index) => {
      const preset = presets.find(p => p.presetSlot === slot);
      const existingTile = existingTiles[index] as HTMLElement;
      
      if (existingTile) {
        // Create new tile and replace the existing one
        const newTile = this.createPresetTile(slot, preset);
        presetsGrid.replaceChild(newTile, existingTile);
      }
    });
  }

  /**
   * Render empty state with welcome flow and starter packs
   */
  private renderEmptyState(): void {

    const emptyState = createElement('div', { className: 'empty-state' });
    
    // Empty state header with welcome message
    const emptyStateHeader = createElement('div', { className: 'empty-state-header' }, [
      createElement('img', {
        src: './icons/icon128-transparent.png',
        alt: 'Not My First Radio',
        className: 'welcome-icon'
      }),
      createElement('p', {
        className: 'welcome'
      }, ['Not My First Radio is a lightweight, private, and local first radio player. Add your favorite stations or start listening right away with a starter pack below. No account required.'])
    ]);
    
    // Starter packs grid with loading indicator
    const starterPacksGrid = createElement('div', { className: 'starter-packs-grid' }, [
      createElement('div', { className: 'loading-indicator' }, [
        createElement('div', { className: 'loading-spinner' }),
        createElement('div', { className: 'loading-text' }, ['Loading starter packs...'])
      ])
    ]);
    
    // Settings import message
    const importMessage = createElement('p', {
      style: 'color: var(--text-secondary);'
    });
    
    const settingsBtn = createElement('button', {
      className: 'settings-btn',
      id: 'empty-state-settings',
      style: 'display: inline; width: auto;'
    }, [
      createElement('span', { className: 'material-symbols-rounded' }, ['settings']),
      'Settings'
    ]);
    
    importMessage.innerHTML = 'Have a .json file? Open ';
    importMessage.appendChild(settingsBtn);
    importMessage.appendChild(document.createTextNode(' to import your stations.'));

    emptyState.appendChild(emptyStateHeader);
    emptyState.appendChild(starterPacksGrid);
    emptyState.appendChild(importMessage);
    
    this.container.appendChild(emptyState);

    // Add event listener to the settings button
    settingsBtn.addEventListener('click', () => {
      eventManager.emit('settings:open');
    });

    // Load starter packs asynchronously
    this.loadStarterPacks(starterPacksGrid);
  }

  /**
   * Load and display starter packs
   */
  private async loadStarterPacks(starterPacksGrid: HTMLElement): Promise<void> {
    const specificPacks = [
      'austin.json',
      'jungle-dnb.json',
      'noise.json',
      'ambient.json',
      'jazz.json',
      'classical.json',
      'kpop.json',
      'blues.json',
      'college-radio.json'
    ];

    try {
      const packs = await Promise.all(specificPacks.map(async (filename) => {
        try {
          const response = await fetch(`./starter-packs/${filename}`);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const data = await response.json();
          return {
            filename,
            data
          };
        } catch (error) {
          console.error(`Error loading starter pack ${filename}:`, error);
          return null;
        }
      }));

      // Filter out failed loads
      const validPacks = packs.filter(pack => pack !== null);
      
      if (validPacks.length === 0) {
        starterPacksGrid.innerHTML = '<p class="no-stations">Error loading starter packs. Please try again later.</p>';
        return;
      }

      // Create starter pack cards
      const starterPackCards = validPacks.map(pack => this.createStarterPackCard(pack));
      
      // Clear loading indicator and add cards
      starterPacksGrid.innerHTML = '';
      starterPackCards.forEach(card => {
        starterPacksGrid.appendChild(card);
      });

    } catch (error) {
      console.error('Error loading starter packs:', error);
      starterPacksGrid.innerHTML = '<p class="no-stations">Error loading starter packs. Please try again later.</p>';
    }
  }

  /**
   * Create a starter pack card element
   */
  private createStarterPackCard(pack: any): HTMLElement {
    const card = createElement('div', {
      className: 'starter-pack-card',
      dataset: { pack: pack.filename.replace('.json', '') }
    });

    // Starter pack image
    const img = createElement('img', {
      src: pack.data.thumbnail_path || 'https://place-hold.it/250x250',
      alt: `${pack.data.username || 'Starter'} Pack`,
      className: 'starter-pack-image'
    });

    // Starter pack content
    const content = createElement('div', { className: 'starter-pack-card-content' }, [
      createElement('p', {}, [pack.data.description || 'A collection of radio stations']),
      createElement('button', {
        className: 'add-starter-pack-btn',
        dataset: { pack: pack.filename.replace('.json', '') }
      }, [
        createElement('span', { className: 'material-symbols-rounded' }, ['add'])
      ])
    ]);

    card.appendChild(img);
    card.appendChild(content);

    // Add event listener to the add button
    const addBtn = content.querySelector('.add-starter-pack-btn') as HTMLButtonElement;
    addBtn.addEventListener('click', () => this.addStarterPack(pack.filename.replace('.json', '')));

    return card;
  }

  /**
   * Add a starter pack to the user's collection
   */
  private async addStarterPack(packName: string): Promise<void> {
    try {
      const response = await fetch(`./starter-packs/${packName}.json`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data || !data.stations || !Array.isArray(data.stations)) {
        eventManager.emit('notification:show', {
          type: 'error',
          message: 'Invalid starter pack format.',
          duration: 3000
        });
        return;
      }

      // Convert RadioStation format to LocalStation format
      const localStations: LocalStation[] = data.stations.map((station: any) => ({
        ...station,
        id: this.generateStationId(),
        dateAdded: new Date().toISOString(),
        playCount: 0,
        isFavorite: false
      }));

      // Import all stations from the pack
      const importedCount = this.importStations(localStations, false);
      
      eventManager.emit('notification:show', {
        type: 'success',
        message: `Starter pack added successfully! ${importedCount} stations imported.`,
        duration: 3000
      });

      // Track achievement for adding starter pack
      eventManager.emit('achievement:unlock', 'first_starter_pack');

    } catch (error) {
      console.error('Error loading starter pack:', error);
      eventManager.emit('notification:show', {
        type: 'error',
        message: 'Failed to load starter pack.',
        duration: 3000
      });
    }
  }

  /**
   * Render presets section with tile layout
   */
  private renderPresetsSection(): void {
    const presets = this.getPresets();
    const allSlots = [1, 2, 3, 4, 5, 6];
    
    const section = createElement('div', { className: 'station-section' });
    section.setAttribute('data-section-id', 'presets');
    
    // Create header with minimize button
    const headerContainer = createElement('div', { className: 'station-section-header' });
    const header = createElement('h3', { className: 'section-title' }, ['Presets']);
    
    const minimizeBtn = createElement('button', { 
      className: 'minimize-btn'
    }) as HTMLButtonElement;
    
    const icon = createElement('span', { className: 'material-symbols-rounded' }, ['expand_less']);
    minimizeBtn.appendChild(icon);
    
    headerContainer.appendChild(header);
    headerContainer.appendChild(minimizeBtn);
    section.appendChild(headerContainer);
    
    // Add click handler for entire header container
    headerContainer.addEventListener('click', () => {
      this.toggleSectionCollapse('presets', section, minimizeBtn);
    });
    
    // Make header container clickable
    headerContainer.style.cursor = 'pointer';
    
    // Create preset tiles grid
    const presetsGrid = createElement('div', { className: 'presets-grid' });
    
    // Create tiles for all 6 slots
    allSlots.forEach(slot => {
      const preset = presets.find(p => p.presetSlot === slot);
      const tile = this.createPresetTile(slot, preset);
      presetsGrid.appendChild(tile);
    });
    
    section.appendChild(presetsGrid);
    
    // Check if section should be collapsed
    const sectionStates = getStorageItem(StorageKeys.SECTION_STATES, {});
    if (sectionStates['presets']) {
      section.classList.add('collapsed');
      icon.textContent = 'expand_more';
    }
    
    this.container?.appendChild(section);
  }

  /**
   * Create a preset tile element
   */
  private createPresetTile(slot: number, station: LocalStation | undefined): HTMLElement {
    const tile = createElement('div', { 
      className: `preset-tile ${!station ? 'empty' : ''}`,
      onclick: () => this.handlePresetTileClick(slot, station)
    });
    
    if (station) {
      // Add context menu and hover functionality for filled presets
      this.addPresetTileInteractions(tile, slot, station);
      // Station favicon
      const faviconContainer = createElement('div', { className: 'preset-favicon' });
      
      if (station.favicon && isValidFaviconUrl(station.favicon)) {
        const favicon = createElement('img', {
          src: station.favicon,
          alt: 'Station logo'
        });
        
        favicon.addEventListener('error', () => {
          const initialsImg = createStationInitialsImage(station.customName || station.name, 48);
          faviconContainer.innerHTML = '';
          faviconContainer.appendChild(initialsImg);
        });
        
        faviconContainer.appendChild(favicon);
      } else {
        faviconContainer.innerHTML = ''; // Clear existing content first
        const initialsImg = createStationInitialsImage(station.customName || station.name, 48);
        faviconContainer.appendChild(initialsImg);
      }
      
      tile.appendChild(faviconContainer);
      
      // Station info container (name + metadata stacked)
      const stationInfoContainer = createElement('div', { className: 'preset-station-info-container' });
      
      // Station name
      const stationName = createElement('div', { className: 'preset-station-name' }, [
        station.customName || station.name
      ]);
      stationInfoContainer.appendChild(stationName);
      
      // Station info (country + bitrate)
      const stationInfo = createElement('div', { className: 'preset-station-info' });
      const infoParts = [];
      if (station.countrycode) infoParts.push(station.countrycode.toUpperCase());
      if (station.bitrate) infoParts.push(`${station.bitrate}kbps`);
      stationInfo.textContent = infoParts.join(' • ');
      stationInfoContainer.appendChild(stationInfo);
      
      tile.appendChild(stationInfoContainer);
      
      // Check if this station is currently playing
      if (this.isStationCurrentlyPlaying(station) && this.isCurrentlyPlaying) {
        tile.classList.add('playing');
      }
    } else {
      // Empty preset slot
      const presetNumber = createElement('div', { className: 'preset-slot-number' }, [slot.toString()]);
      tile.appendChild(presetNumber);
    }
    
    return tile;
  }

  /**
   * Add interactions (context menu and hover) to preset tiles
   */
  private addPresetTileInteractions(tile: HTMLElement, slot: number, station: LocalStation): void {
    // Create hover overlay with remove button
    const hoverOverlay = createElement('div', { className: 'preset-hover-overlay' });
    const removeBtn = createElement('button', { 
      className: 'preset-remove-btn',
      title: `Remove from Preset ${slot}`
    });
    removeBtn.innerHTML = '<span class="material-symbols-rounded">close</span>';
    
    // Prevent click event bubbling when clicking remove button
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removePreset(slot);
      eventManager.emit('notification:show', {
        type: 'success',
        message: `${station.name} removed from Preset ${slot}`
      });
    });
    
    hoverOverlay.appendChild(removeBtn);
    tile.appendChild(hoverOverlay);

    // Add right-click context menu
    tile.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.showPresetContextMenu(e, tile, slot, station);
    });

    // Add long-press for mobile and prevent sticky hover states
    let longPressTimer: NodeJS.Timeout;
    let isLongPress = false;
    let isTouchDevice = false;

    tile.addEventListener('touchstart', (e) => {
      isTouchDevice = true;
      isLongPress = false;
      
      // Show overlay immediately on long press start for mobile feedback
      longPressTimer = setTimeout(() => {
        isLongPress = true;
        hoverOverlay.style.opacity = '1';
        hoverOverlay.style.pointerEvents = 'auto';
        
        // Convert touch event to a contextmenu-like event
        const touch = e.touches[0];
        const contextEvent = new MouseEvent('contextmenu', {
          clientX: touch.clientX,
          clientY: touch.clientY,
          bubbles: true,
          cancelable: true
        });
        this.showPresetContextMenu(contextEvent, tile, slot, station);
      }, 500); // 500ms long press
    });

    tile.addEventListener('touchend', (e) => {
      clearTimeout(longPressTimer);
      
      // Always hide overlay on touch end to prevent sticky states
      if (isTouchDevice && !isLongPress) {
        hoverOverlay.style.opacity = '0';
        hoverOverlay.style.pointerEvents = 'none';
      }
      
      // Reset after a brief delay
      setTimeout(() => {
        if (isTouchDevice) {
          hoverOverlay.style.opacity = '0';
          hoverOverlay.style.pointerEvents = 'none';
        }
      }, 100);
    });

    tile.addEventListener('touchmove', () => {
      clearTimeout(longPressTimer);
      // Hide overlay on touch move
      if (isTouchDevice) {
        hoverOverlay.style.opacity = '0';
        hoverOverlay.style.pointerEvents = 'none';
      }
    });

    tile.addEventListener('touchcancel', () => {
      clearTimeout(longPressTimer);
      // Hide overlay on touch cancel
      if (isTouchDevice) {
        hoverOverlay.style.opacity = '0';
        hoverOverlay.style.pointerEvents = 'none';
      }
    });

    // Prevent default click if it was a long press
    const originalClick = tile.onclick;
    tile.onclick = (e) => {
      if (!isLongPress && originalClick) {
        originalClick.call(tile, e);
      }
      isLongPress = false;
    };
  }

  /**
   * Show context menu for preset tiles
   */
  private showPresetContextMenu(event: MouseEvent, tile: HTMLElement, slot: number, station: LocalStation): void {
    // Remove any existing context menus
    document.querySelectorAll('.preset-context-menu').forEach(menu => menu.remove());

    const menu = createElement('div', { className: 'preset-context-menu' });
    
    // Play option
    const playBtn = createElement('button', { className: 'preset-menu-item' });
    playBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span> Play Station';
    playBtn.addEventListener('click', () => {
      eventManager.emit('station:play-request', station);
      menu.remove();
    });

    // Remove from preset option
    const removeBtn = createElement('button', { className: 'preset-menu-item remove' });
    removeBtn.innerHTML = `<span class="material-symbols-rounded">radio_button_unchecked</span> Remove from Preset ${slot}`;
    removeBtn.addEventListener('click', () => {
      this.removePreset(slot);
      eventManager.emit('notification:show', {
        type: 'success',
        message: `${station.name} removed from Preset ${slot}`
      });
      menu.remove();
    });

    menu.appendChild(playBtn);
    menu.appendChild(removeBtn);

    // Position menu
    menu.style.position = 'fixed';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.style.zIndex = '1000';

    // Add to document
    document.body.appendChild(menu);

    // Close menu when clicking outside
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    
    // Delay adding the click listener to prevent immediate closure
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 0);
  }

  /**
   * Handle preset tile click
   */
  private handlePresetTileClick(slot: number, station: LocalStation | undefined): void {
    if (station) {
      // Play the preset station
      eventManager.emit('station:play-request', station);
    } else {
      // Show preset selection modal/menu
      this.showPresetSelectionModal(slot);
    }
  }

  /**
   * Show modal to select station for preset slot
   */
  private showPresetSelectionModal(slot: number, station?: LocalStation): void {
    if (station) {
      // Station is provided, show slot selection
      const availableSlots = this.getAvailablePresetSlots();
      
      if (availableSlots.length === 0) {
        eventManager.emit('notification:show', {
          type: 'info',
          message: 'All preset slots are filled!'
        });
        return;
      }
      
      // Emit event for modal manager to show preset slot selection
      eventManager.emit('preset:select-slot', { station, availableSlots });
    } else {
      // Slot is provided, show station selection
      const availableStations = this.stations.filter(s => s.presetSlot === undefined);
      
      if (availableStations.length === 0) {
        eventManager.emit('notification:show', {
          type: 'info',
          message: 'No stations available to add as presets. Add some stations first!'
        });
        return;
      }
      
      // Emit event for modal manager to show station selection
      eventManager.emit('preset:select-station', { slot, availableStations });
    }
  }


  /**
   * Render a section of stations with sorting dropdown
   */
  private renderStationSectionWithSort(title: string, stations: LocalStation[]): void {
    // Always render the section to show filter UI, even if no stations match
    const hasFilter = this.filterQuery.trim().length > 0;
    if (stations.length === 0 && !hasFilter) return;

    const section = createElement('div', { className: 'station-section' });
    const sectionId = title.toLowerCase().replace(/\s+/g, '-');
    section.setAttribute('data-section-id', sectionId);
    
    // Create header with filter input and sort dropdown
    const headerContainer = createElement('div', { className: 'station-section-header with-filter' });
    const headerLeft = createElement('div', { className: 'header-left' });
    const headerRight = createElement('div', { className: 'header-right' });
    
    const header = createElement('h3', { className: 'section-title' }, [title]);
    headerLeft.appendChild(header);

    // Create filter input container
    const filterContainer = createElement('div', { className: 'filter-container' });
    const filterInput = createElement('input', {
      type: 'text',
      className: 'filter-input',
      placeholder: 'Filter by name',
      value: this.filterQuery
    });

    // Add clear filter button
    const clearFilterBtn = createElement('button', {
      className: `clear-filter-btn ${this.filterQuery ? '' : 'hidden'}`,
      title: 'Clear filter'
    });
    clearFilterBtn.innerHTML = '<span class="material-symbols-rounded">close</span>';

    filterContainer.appendChild(filterInput);
    filterContainer.appendChild(clearFilterBtn);
    
    // Create sort dropdown
    const sortContainer = createElement('div', { className: 'sort-container' });
    const sortLabel = createElement('span', { className: 'sort-label' }, ['Sort by:']);
    const sortSelect = createElement('select', { className: 'sort-select' });
    
    // Add sort options
    STATION_SORT_OPTIONS.forEach(config => {
      const option = createElement('option', { value: config.option }, [config.label]);
      if (config.option === this.currentSortOption) {
        option.selected = true;
      }
      sortSelect.appendChild(option);
    });
    
    // Capture the current container context for event handlers
    const currentContainer = this.container;

    // Handle sort change
    sortSelect.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      this.currentSortOption = target.value as StationSortOption;
      this.saveSortPreference();
      
      // Update the stations grid within the current container context
      const stationsGrid = currentContainer.querySelector('.stations-grid');
      if (stationsGrid) {
        const filteredStations = this.filterStations(this.stations);
        const sortedStations = this.sortStations(filteredStations);
        this.updateStationsGrid(stationsGrid as HTMLElement, sortedStations);
      }
    });

    // Handle filter input
    filterInput.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      const query = target.value;
      this.filterQuery = query;
      
      // Toggle clear button visibility
      if (query.length > 0) {
        clearFilterBtn.classList.remove('hidden');
      } else {
        clearFilterBtn.classList.add('hidden');
      }
      
      // Apply debounced filtering within the current container context
      this.debouncedFilterInContainer(currentContainer);
    });

    // Handle clear filter button
    clearFilterBtn.addEventListener('click', () => {
      this.filterQuery = '';
      filterInput.value = '';
      clearFilterBtn.classList.add('hidden');
      filterInput.focus();
      
      // Update the stations grid within the current container context
      const stationsGrid = currentContainer.querySelector('.stations-grid');
      if (stationsGrid) {
        const filteredStations = this.filterStations(this.stations);
        const sortedStations = this.sortStations(filteredStations);
        this.updateStationsGrid(stationsGrid as HTMLElement, sortedStations);
      }
    });
    
    sortContainer.appendChild(sortLabel);
    sortContainer.appendChild(sortSelect);
    
    // Add filter and sort to header right (mobile-friendly order)
    headerLeft.appendChild(filterContainer);
    headerRight.appendChild(sortContainer);
    
    headerContainer.appendChild(headerLeft);
    headerContainer.appendChild(headerRight);
    section.appendChild(headerContainer);

    const grid = createElement('div', { className: 'stations-grid' });
    
    if (stations.length === 0 && hasFilter) {
      // Show "no results" message when filter returns no stations
      const noResults = createElement('div', { className: 'filter-no-results' });
      noResults.innerHTML = `
        <p>No stations match "${this.filterQuery}"</p>
        <button class="clear-filter-link">Clear filter</button>
      `;
      
      const clearLink = noResults.querySelector('.clear-filter-link') as HTMLButtonElement;
      clearLink.addEventListener('click', () => {
        this.filterQuery = '';
        const filterInput = section.querySelector('.filter-input') as HTMLInputElement;
        if (filterInput) {
          filterInput.value = '';
          filterInput.focus();
        }
        // Re-update the grid within the current context
        const stationsGrid = currentContainer.querySelector('.stations-grid');
        if (stationsGrid) {
          const filteredStations = this.filterStations(this.stations);
          const sortedStations = this.sortStations(filteredStations);
          this.updateStationsGrid(stationsGrid as HTMLElement, sortedStations);
        }
      });
      
      grid.appendChild(noResults);
    } else {
      stations.forEach(station => {
        const stationCard = this.createStationCard(station);
        grid.appendChild(stationCard);
      });
    }

    section.appendChild(grid);
    this.container.appendChild(section);
  }

  /**
   * Toggle section collapse state
   */
  private toggleSectionCollapse(sectionId: string, section: HTMLElement, button: HTMLButtonElement): void {
    const isCollapsed = section.classList.contains('collapsed');
    
    if (isCollapsed) {
      // Expand section
      section.classList.remove('collapsed');
      button.innerHTML = '<span class="material-symbols-rounded">expand_less</span>';
      button.title = 'Minimize section';
    } else {
      // Collapse section
      section.classList.add('collapsed');
      button.innerHTML = '<span class="material-symbols-rounded">expand_more</span>';
      button.title = 'Expand section';
    }
    
    // Save state to localStorage
    const sectionStates = getStorageItem(StorageKeys.SECTION_STATES, {});
    sectionStates[sectionId] = !isCollapsed;
    setStorageItem(StorageKeys.SECTION_STATES, sectionStates);
  }

  /**
   * Create a station card element
   */
  private createStationCard(station: LocalStation): HTMLElement {
    const isCurrentlyPlaying = this.isStationCurrentlyPlaying(station);
    const card = createElement('div', {
      className: `station-card ${isCurrentlyPlaying ? 'playing' : ''}`,
      dataset: { stationId: station.id }
    });

    // Station info section
    const stationInfo = createElement('div', { className: 'station-info' });

    // Station favicon
    const faviconContainer = createElement('div', { className: 'station-favicon' });
    
    if (station.favicon && isValidFaviconUrl(station.favicon)) {
      const favicon = createElement('img', {
        src: station.favicon,
        alt: 'Station logo'
      });
      
      favicon.addEventListener('error', () => {
        const initialsImg = createStationInitialsImage(station.customName || station.name, 48);
        faviconContainer.innerHTML = '';
        faviconContainer.appendChild(initialsImg);
      });
      
      faviconContainer.appendChild(favicon);
    } else {
      faviconContainer.innerHTML = ''; // Clear existing content first
      const initialsImg = createStationInitialsImage(station.customName || station.name, 48);
      faviconContainer.appendChild(initialsImg);
    }

    // Add preset number label if station is a preset
    if (station.presetSlot) {
      const presetLabel = createElement('div', { 
        className: 'preset-number-label',
        title: `Preset ${station.presetSlot}`
      }, [station.presetSlot.toString()]);
      faviconContainer.appendChild(presetLabel);
    }

    stationInfo.appendChild(faviconContainer);

    // Station details
    const stationDetails = createElement('div', { className: 'station-details' });
    
    const stationNameContainer = createElement('div', { className: 'station-name-container' });
    const stationName = createElement('h3', {}, [station.customName || station.name]);
    stationNameContainer.appendChild(stationName);
    
    // Add NEW badge for stations that haven't been played yet
    if ((station.playCount || 0) === 0) {
      const newBadge = createElement('span', { 
        className: 'station-new-badge',
        title: 'New station - not played yet'
      }, ['NEW']);
      stationNameContainer.appendChild(newBadge);
    }
    
    // Add animated equalizer for currently playing station
    if (isCurrentlyPlaying && this.isCurrentlyPlaying) {
      const equalizerIcon = createElement('div', { 
        className: 'now-playing-icon',
        title: 'Now playing'
      });
      equalizerIcon.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 14V15H1V14H3Z M3 13V14H1V13H3Z M3 12V13H1V12H3Z M3 11V12H1V11H3Z M3 10V11H1V10H3Z M3 9V10H1V9H3Z M3 8V9H1V8H3Z M3 7V8H1V7H3Z M3 6V7H1V6H3Z M3 5V6H1V5H3Z M3 4V5H1V4H3Z M3 3V4H1V3H3Z M3 2V3H1V2H3Z" fill="#00FFA2"/>
          <path d="M6 14V15H4V14H6Z M6 13V14H4V13H6Z M6 12V13H4V12H6Z M6 11V12H4V11H6Z M6 10V11H4V10H6Z M6 9V10H4V9H6Z M6 8V9H4V8H6Z M6 7V8H4V7H6Z M6 6V7H4V6H6Z M6 5V6H4V5H6Z M6 4V5H4V4H6Z M6 3V4H4V3H6Z M6 2V3H4V2H6Z" fill="#00FFA2"/>
          <path d="M9 14V15H7V14H9Z M9 13V14H7V13H9Z M9 12V13H7V12H9Z M9 11V12H7V11H9Z M9 10V11H7V10H9Z M9 9V10H7V9H9Z M9 8V9H7V8H9Z M9 7V8H7V7H9Z M9 6V7H7V6H9Z M9 5V6H7V5H9Z M9 4V5H7V4H9Z M9 3V4H7V3H9Z M9 2V3H7V2H9Z" fill="#00FFA2"/>
          <path d="M12 14V15H10V14H12Z M12 13V14H10V13H12Z M12 12V13H10V12H12Z M12 11V12H10V11H12Z M12 10V11H10V10H12Z M12 9V10H10V9H12Z M12 8V9H10V8H12Z M12 7V8H10V7H12Z M12 6V7H10V6H12Z M12 5V6H10V5H12Z M12 4V5H10V4H12Z M12 3V4H10V3H12Z M12 2V3H10V2H12Z" fill="#00FFA2"/>
          <path d="M15 14V15H13V14H15Z M15 13V14H13V13H15Z M15 12V13H13V12H15Z M15 11V12H13V11H15Z M15 10V11H13V10H15Z M15 9V10H13V9H15Z M15 8V9H13V8H15Z M15 7V8H13V7H15Z M15 6V7H13V6H15Z M15 5V6H13V5H15Z M15 4V5H13V4H15Z M15 3V4H13V3H15Z M15 2V3H13V2H15Z" fill="#00FFA2"/>
          <path d="M3 1V2H1V1H3Z" fill="#9E66F2"/>
          <path d="M6 1V2H4V1H6Z" fill="#9E66F2"/>
          <path d="M9 1V2H7V1H9Z" fill="#9E66F2"/>
          <path d="M12 1V2H10V1H12Z" fill="#9E66F2"/>
          <path d="M15 1V2H13V1H15Z" fill="#9E66F2"/>
        </svg>
      `;
      stationNameContainer.appendChild(equalizerIcon);
    }
    
    
    stationDetails.appendChild(stationNameContainer);

    // Station metadata
    const stationMeta = createElement('div', { className: 'station-meta' });
    
    // Use regular formatting with icons
    if (station.bitrate && station.bitrate > 0) {
      const bitrateSpan = createElement('span', {});
      bitrateSpan.innerHTML = `${getBitrateIcon()} ${station.bitrate}kbps`;
      stationMeta.appendChild(bitrateSpan);
    }

    if (station.countrycode || station.country) {
      const countrySpan = createElement('span', {});
      countrySpan.innerHTML = `${getCountryIcon()} ${station.countrycode || station.country}`;
      stationMeta.appendChild(countrySpan);
    }

    if (station.votes && station.votes > 0) {
      const votesSpan = createElement('span', {});
      votesSpan.innerHTML = `${getVotesIcon()} ${station.votes}`;
      stationMeta.appendChild(votesSpan);
    }

    stationDetails.appendChild(stationMeta);

    // Add note if present (after metadata)
    if (station.note) {
      const noteDiv = createElement('div', { className: 'station-note' }, [station.note]);
      stationDetails.appendChild(noteDiv);
    }
    stationInfo.appendChild(stationDetails);
    card.appendChild(stationInfo);

    // Station controls
    const stationControls = createElement('div', { className: 'station-controls' });
    
    const playBtn = createElement('button', {
      className: 'play-btn',
      title: 'Play/pause station'
    });
    
    const playIcon = createElement('span', { className: 'material-symbols-rounded' }, ['play_arrow']);
    playBtn.appendChild(playIcon);
    
    // Update play button icon based on current state
    this.updatePlayButtonIcon(playBtn, station);
    
    // Add scroll-aware touch handling for play button too
    let playBtnTouchStartTime = 0;
    let playBtnTouchStartY = 0;
    let playBtnTouchStartX = 0;
    let playBtnHasMoved = false;
    
    const handlePlayBtnClick = (e: Event) => {
      e.stopPropagation(); // Prevent card click from also firing
      eventManager.emit('station:toggle-play', station);
    };

    const handlePlayBtnTouchStart = (e: TouchEvent) => {
      playBtnTouchStartTime = Date.now();
      playBtnTouchStartY = e.touches[0].clientY;
      playBtnTouchStartX = e.touches[0].clientX;
      playBtnHasMoved = false;
    };

    const handlePlayBtnTouchMove = (e: TouchEvent) => {
      if (!playBtnHasMoved) {
        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const deltaY = Math.abs(currentY - playBtnTouchStartY);
        const deltaX = Math.abs(currentX - playBtnTouchStartX);
        
        if (deltaY > 10 || deltaX > 10) {
          playBtnHasMoved = true;
        }
      }
    };

    const handlePlayBtnTouchEnd = (e: TouchEvent) => {
      const touchDuration = Date.now() - playBtnTouchStartTime;
      
      if (!playBtnHasMoved && touchDuration < 500) {
        e.preventDefault();
        e.stopPropagation();
        handlePlayBtnClick(e);
      }
    };

    playBtn.addEventListener('click', handlePlayBtnClick);
    playBtn.addEventListener('touchstart', handlePlayBtnTouchStart, { passive: true });
    playBtn.addEventListener('touchmove', handlePlayBtnTouchMove, { passive: true });
    playBtn.addEventListener('touchend', handlePlayBtnTouchEnd);

    // Add hover effect for playing stations
    card.addEventListener('mouseenter', () => {
      if (this.isStationCurrentlyPlaying(station) && this.isCurrentlyPlaying) {
        playIcon.textContent = 'pause';
      }
    });

    card.addEventListener('mouseleave', () => {
      this.updatePlayButtonIcon(playBtn, station);
    });

    const moreBtn = createElement('button', {
      className: 'more-btn',
      title: 'More actions'
    });
    moreBtn.innerHTML = '<span class="material-symbols-rounded">more_vert</span>';

    stationControls.appendChild(playBtn);
    stationControls.appendChild(moreBtn);
    card.appendChild(stationControls);

    // Create menu overlay and dropdown
    const menuOverlay = createElement('div', { className: 'station-menu-overlay hidden' });
    const menu = createElement('div', { className: 'station-menu hidden' });

    // Station menu info section
    const menuInfo = createElement('div', { className: 'station-menu-info' });
    
    // Menu favicon
    const menuFavicon = createElement('div', { 
      className: 'station-menu-favicon',
      style: station.favicon && isValidFaviconUrl(station.favicon) ? 'display: flex;' : 'display: none;'
    });
    if (station.favicon && isValidFaviconUrl(station.favicon)) {
      const faviconImg = createElement('img', {
        src: station.favicon,
        alt: `${station.name} logo`
      });
      
      faviconImg.addEventListener('error', () => {
        const initialsImg = createStationInitialsImage(station.customName || station.name, 32);
        menuFavicon.innerHTML = '';
        menuFavicon.appendChild(initialsImg);
      });
      
      menuFavicon.appendChild(faviconImg);
    }
    menuInfo.appendChild(menuFavicon);

    // Menu station name
    const menuName = createElement('div', { className: 'station-menu-name' }, [station.name]);
    menuInfo.appendChild(menuName);

    // Menu station data
    const menuData = createElement('div', { className: 'station-menu-data' });
    
    if (station.bitrate && station.bitrate > 0) {
      const bitrateItem = createElement('div', { className: 'station-menu-data-item' });
      bitrateItem.innerHTML = `<span class="material-symbols-rounded">radio</span>${station.bitrate}kbps`;
      menuData.appendChild(bitrateItem);
    }
    
    if (station.countrycode || station.country) {
      const countryItem = createElement('div', { className: 'station-menu-data-item' });
      countryItem.innerHTML = `<span class="material-symbols-rounded">public</span>${station.countrycode || station.country}`;
      menuData.appendChild(countryItem);
    }
    
    if (station.votes && station.votes > 0) {
      const votesItem = createElement('div', { className: 'station-menu-data-item' });
      votesItem.innerHTML = `<span class="material-symbols-rounded">local_fire_department</span>${station.votes}`;
      menuData.appendChild(votesItem);
    }

    menuInfo.appendChild(menuData);
    menu.appendChild(menuInfo);

    // Menu actions
    const shareBtn = createElement('button', { className: 'menu-share' });
    shareBtn.innerHTML = '<span class="material-symbols-rounded">share</span> Share';
    shareBtn.addEventListener('click', (e) => this.handleMenuAction(e, menu, menuOverlay, 'share', station));

    const editNoteBtn = createElement('button', { className: 'menu-edit-note' });
    editNoteBtn.innerHTML = '<span class="material-symbols-rounded">edit</span> Edit Note';
    editNoteBtn.addEventListener('click', (e) => this.handleMenuAction(e, menu, menuOverlay, 'edit-note', station, card));

    const homepageBtn = createElement('button', { className: 'menu-homepage' });
    homepageBtn.innerHTML = '<span class="material-symbols-rounded">open_in_new</span> Visit Website';
    homepageBtn.addEventListener('click', (e) => this.handleMenuAction(e, menu, menuOverlay, 'homepage', station));

    const deleteBtn = createElement('button', { className: 'menu-delete' });
    deleteBtn.innerHTML = '<span class="material-symbols-rounded">delete</span> Delete';
    deleteBtn.addEventListener('click', (e) => this.handleMenuAction(e, menu, menuOverlay, 'delete', station));

    menu.appendChild(shareBtn);
    menu.appendChild(editNoteBtn);
    menu.appendChild(homepageBtn);
    menu.appendChild(deleteBtn);


    // Preset menu items
    const availableSlots = this.getAvailablePresetSlots();
    const currentPresetSlot = station.presetSlot;
    
    if (currentPresetSlot) {
      // Station is already a preset - show remove option
      const removePresetBtn = createElement('button', { className: 'menu-remove-preset' });
      removePresetBtn.innerHTML = `<span class="material-symbols-rounded">radio</span> Remove from Preset ${currentPresetSlot}`;
      removePresetBtn.addEventListener('click', (e) => this.handleMenuAction(e, menu, menuOverlay, 'remove-preset', station));
      menu.appendChild(removePresetBtn);
    } else if (availableSlots.length > 0) {
      // Station can be added to presets - show available slots
      const presetHeader = createElement('div', { className: 'menu-preset-header' }, ['Add to Preset:']);
      menu.appendChild(presetHeader);
      
      availableSlots.slice(0, 3).forEach(slot => { // Show max 3 slots to avoid long menu
        const addPresetBtn = createElement('button', { className: 'menu-add-preset' });
        addPresetBtn.innerHTML = `<span class="material-symbols-rounded">radio</span> Preset ${slot}`;
        addPresetBtn.addEventListener('click', (e) => this.handleMenuAction(e, menu, menuOverlay, 'add-preset', station, undefined, slot));
        menu.appendChild(addPresetBtn);
      });
      
      if (availableSlots.length > 3) {
        const morePresetsBtn = createElement('button', { className: 'menu-more-presets' });
        morePresetsBtn.innerHTML = `<span class="material-symbols-rounded">more_horiz</span> More preset slots...`;
        morePresetsBtn.addEventListener('click', (e) => this.handleMenuAction(e, menu, menuOverlay, 'show-all-presets', station));
        menu.appendChild(morePresetsBtn);
      }
    } else {
      // No preset slots available
      const noSlotsBtn = createElement('div', { className: 'menu-preset-disabled' });
      noSlotsBtn.innerHTML = '<span class="material-symbols-rounded">radio_button_unchecked</span> All presets filled';
      noSlotsBtn.style.opacity = '0.5';
      noSlotsBtn.style.cursor = 'not-allowed';
      menu.appendChild(noSlotsBtn);
    }

    card.appendChild(menuOverlay);
    card.appendChild(menu);

    // Function to update preset section of the menu
    const updateMenuPresetSection = () => {
      // Remove existing preset menu items
      const existingPresetItems = menu.querySelectorAll('.menu-remove-preset, .menu-add-preset, .menu-more-presets, .menu-preset-disabled, .menu-preset-header');
      existingPresetItems.forEach(item => item.remove());

      // Get current available slots and preset status
      const availableSlots = this.getAvailablePresetSlots();
      const currentPresetSlot = station.presetSlot;
      
      if (currentPresetSlot) {
        // Station is already a preset - show remove option
        const removePresetBtn = createElement('button', { className: 'menu-remove-preset' });
        removePresetBtn.innerHTML = `<span class="material-symbols-rounded">radio</span> Remove from Preset ${currentPresetSlot}`;
        removePresetBtn.addEventListener('click', (e) => this.handleMenuAction(e, menu, menuOverlay, 'remove-preset', station));
        menu.appendChild(removePresetBtn);
      } else if (availableSlots.length > 0) {
        // Station can be added to presets - show available slots
        const presetHeader = createElement('div', { className: 'menu-preset-header' }, ['Add to Preset:']);
        menu.appendChild(presetHeader);
        
        availableSlots.slice(0, 3).forEach(slot => { // Show max 3 slots to avoid long menu
          const addPresetBtn = createElement('button', { className: 'menu-add-preset' });
          addPresetBtn.innerHTML = `<span class="material-symbols-rounded">radio</span> Preset ${slot}`;
          addPresetBtn.addEventListener('click', (e) => this.handleMenuAction(e, menu, menuOverlay, 'add-preset', station, undefined, slot));
          menu.appendChild(addPresetBtn);
        });
        
        if (availableSlots.length > 3) {
          const morePresetsBtn = createElement('button', { className: 'menu-more-presets' });
          morePresetsBtn.innerHTML = `<span class="material-symbols-rounded">more_horiz</span> More preset slots...`;
          morePresetsBtn.addEventListener('click', (e) => this.handleMenuAction(e, menu, menuOverlay, 'show-all-presets', station));
          menu.appendChild(morePresetsBtn);
        }
      } else {
        // No preset slots available
        const noSlotsBtn = createElement('div', { className: 'menu-preset-disabled' });
        noSlotsBtn.innerHTML = '<span class="material-symbols-rounded">radio_button_unchecked</span> All presets filled';
        noSlotsBtn.style.opacity = '0.5';
        noSlotsBtn.style.cursor = 'not-allowed';
        menu.appendChild(noSlotsBtn);
      }
    };

    // Menu button event handlers with scroll detection
    let touchStartTime = 0;
    let touchStartY = 0;
    let touchStartX = 0;
    let hasMoved = false;
    
    const handleMoreBtnClick = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Update preset section with current available slots
      updateMenuPresetSection();
      
      menu.classList.remove('hidden');
      menuOverlay.classList.remove('hidden');
      if (window.innerWidth <= 768) {
        menu.classList.add('active');
      }
    };

    const handleMoreBtnTouchStart = (e: TouchEvent) => {
      touchStartTime = Date.now();
      touchStartY = e.touches[0].clientY;
      touchStartX = e.touches[0].clientX;
      hasMoved = false;
    };

    const handleMoreBtnTouchMove = (e: TouchEvent) => {
      if (!hasMoved) {
        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const deltaY = Math.abs(currentY - touchStartY);
        const deltaX = Math.abs(currentX - touchStartX);
        
        // If user has moved more than 10px in any direction, consider it a scroll/swipe
        if (deltaY > 10 || deltaX > 10) {
          hasMoved = true;
        }
      }
    };

    const handleMoreBtnTouchEnd = (e: TouchEvent) => {
      const touchDuration = Date.now() - touchStartTime;
      
      // Only trigger menu if:
      // 1. Touch was short (less than 500ms) - not a long press during scroll
      // 2. User didn't move significantly (less than 10px) - not a scroll gesture
      // 3. Prevent default click event from also firing
      if (!hasMoved && touchDuration < 500) {
        e.preventDefault();
        e.stopPropagation();
        handleMoreBtnClick(e);
      }
    };

    moreBtn.addEventListener('click', handleMoreBtnClick);
    moreBtn.addEventListener('touchstart', handleMoreBtnTouchStart, { passive: true });
    moreBtn.addEventListener('touchmove', handleMoreBtnTouchMove, { passive: true });
    moreBtn.addEventListener('touchend', handleMoreBtnTouchEnd);

    // Close menu handlers
    const closeMenu = () => {
      menu.classList.add('hidden');
      menuOverlay.classList.add('hidden');
      if (window.innerWidth <= 768) {
        menu.classList.remove('active');
      }
    };

    // Enhanced close menu handling for mobile
    let overlayTouchStartTime = 0;
    let overlayTouchStartY = 0;
    let overlayTouchStartX = 0;
    let overlayHasMoved = false;

    const handleOverlayTouchStart = (e: TouchEvent) => {
      overlayTouchStartTime = Date.now();
      overlayTouchStartY = e.touches[0].clientY;
      overlayTouchStartX = e.touches[0].clientX;
      overlayHasMoved = false;
    };

    const handleOverlayTouchMove = (e: TouchEvent) => {
      if (!overlayHasMoved) {
        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const deltaY = Math.abs(currentY - overlayTouchStartY);
        const deltaX = Math.abs(currentX - overlayTouchStartX);
        
        if (deltaY > 10 || deltaX > 10) {
          overlayHasMoved = true;
        }
      }
    };

    const handleOverlayTouchEnd = (e: TouchEvent) => {
      const touchDuration = Date.now() - overlayTouchStartTime;
      
      // Only close menu if it was a short tap without movement
      if (!overlayHasMoved && touchDuration < 300) {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      }
    };

    menuOverlay.addEventListener('click', closeMenu);
    menuOverlay.addEventListener('touchstart', handleOverlayTouchStart, { passive: true });
    menuOverlay.addEventListener('touchmove', handleOverlayTouchMove, { passive: true });
    menuOverlay.addEventListener('touchend', handleOverlayTouchEnd);

    // Close when clicking outside card
    document.addEventListener('click', (e) => {
      if (!card.contains(e.target as Node)) {
        closeMenu();
      }
    });

    // Make entire card clickable to play/pause station with scroll detection
    let cardTouchStartTime = 0;
    let cardTouchStartY = 0;
    let cardTouchStartX = 0;
    let cardHasMoved = false;

    const handleCardClick = (e: Event) => {
      // Don't trigger if clicking on buttons, menu elements, or input fields
      const target = e.target as HTMLElement;
      if (target.closest('button') || 
          target.closest('.station-menu') || 
          target.closest('.station-menu-overlay') ||
          target.closest('input') ||
          target.closest('.note-input') ||
          target.closest('.note-actions')) {
        return;
      }
      
      // Check if this station is currently playing and toggle accordingly
      eventManager.emit('station:toggle-play', station);
    };

    const handleCardTouchStart = (e: TouchEvent) => {
      // Only track if not touching a button
      const target = e.target as HTMLElement;
      if (target.closest('button')) {
        return;
      }
      
      cardTouchStartTime = Date.now();
      cardTouchStartY = e.touches[0].clientY;
      cardTouchStartX = e.touches[0].clientX;
      cardHasMoved = false;
    };

    const handleCardTouchMove = (e: TouchEvent) => {
      if (!cardHasMoved && cardTouchStartTime > 0) {
        const currentY = e.touches[0].clientY;
        const currentX = e.touches[0].clientX;
        const deltaY = Math.abs(currentY - cardTouchStartY);
        const deltaX = Math.abs(currentX - cardTouchStartX);
        
        if (deltaY > 15 || deltaX > 15) {
          cardHasMoved = true;
        }
      }
    };

    const handleCardTouchEnd = (e: TouchEvent) => {
      const touchDuration = Date.now() - cardTouchStartTime;
      
      // Only trigger card action if it was a short tap without movement
      if (cardTouchStartTime > 0 && !cardHasMoved && touchDuration < 300) {
        e.preventDefault();
        handleCardClick(e);
      }
      
      // Reset tracking
      cardTouchStartTime = 0;
    };

    card.addEventListener('click', handleCardClick);
    card.addEventListener('touchstart', handleCardTouchStart, { passive: true });
    card.addEventListener('touchmove', handleCardTouchMove, { passive: true });
    card.addEventListener('touchend', handleCardTouchEnd);


    return card;
  }

  /**
   * Handle menu actions
   */
  private handleMenuAction(
    e: Event, 
    menu: HTMLElement, 
    overlay: HTMLElement, 
    action: string, 
    station: LocalStation, 
    card?: HTMLElement,
    slot?: number
  ): void {
    e.preventDefault();
    e.stopPropagation();
    
    // Close menu
    menu.classList.add('hidden');
    overlay.classList.add('hidden');
    if (window.innerWidth <= 768) {
      menu.classList.remove('active');
    }

    switch (action) {
      case 'share':
        this.shareStation(station);
        break;
      case 'edit-note':
        if (card) this.showEditNoteUI(card, station);
        break;
      case 'homepage':
        this.visitStationWebsite(station);
        break;
      case 'delete':
        this.confirmAndRemoveStation(station);
        break;
      case 'add-preset':
        if (slot) {
          this.setPreset(station.id, slot);
          eventManager.emit('notification:show', {
            type: 'success',
            message: `${station.name} added to Preset ${slot}`
          });
        }
        break;
      case 'remove-preset':
        if (station.presetSlot) {
          const presetNumber = station.presetSlot;
          this.removePreset(station.presetSlot);
          eventManager.emit('notification:show', {
            type: 'success',
            message: `${station.name} removed from Preset ${presetNumber}`
          });
        }
        break;
      case 'show-all-presets':
        this.showPresetSelectionModal(0, station); // 0 means show all slots
        break;
    }
  }

  /**
   * Share station functionality
   */
  async shareStation(station: LocalStation): Promise<void> {
    try {
      const username = this.getCurrentUsername();
      
      // Generate shortened share URL
      const shareUrl = await sharingService.shareStation(username, station);

      // Always use clipboard instead of system share sheet
      const originalUrl = sharingService.createShareUrl(sharingService.createShareData(username, [station]));
      this.copyToClipboard(shareUrl, shareUrl !== originalUrl);
    } catch (error) {
      console.error('Share station error:', error);
      eventManager.emit('notification:show', {
        type: 'error',
        message: 'Failed to share station',
        duration: 3000
      });
    }
  }

  /**
   * Copy URL to clipboard with appropriate messaging
   */
  private async copyToClipboard(url: string, wasShortened: boolean): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      const message = wasShortened 
        ? 'Short sharing link copied to clipboard!'
        : 'Sharing link copied to clipboard!';
      eventManager.emit('notification:show', {
        type: 'success',
        message,
        duration: 3000
      });
    } catch (error) {
      console.error('Clipboard error:', error);
      eventManager.emit('notification:show', {
        type: 'error',
        message: 'Failed to copy link to clipboard',
        duration: 3000
      });
    }
  }

  /**
   * Get current username from storage (UserManager stores it there)
   */
  private getCurrentUsername(): string {
    return getStorageItem(StorageKeys.USERNAME, 'User');
  }

  /**
   * Show edit note UI
   */
  private showEditNoteUI(card: HTMLElement, station: LocalStation): void {
    let noteDiv = card.querySelector('.station-note') as HTMLElement;
    if (!noteDiv) {
      noteDiv = createElement('div', { className: 'station-note' });
      const stationDetails = card.querySelector('.station-details');
      if (stationDetails) {
        // Insert note after metadata (station-meta is the last child of metadata)
        stationDetails.appendChild(noteDiv);
      }
    }

    noteDiv.innerHTML = `
      <input maxlength="100" placeholder="Add a note..." class="note-input" type="text" value="${station.note || ''}">
      <div class="note-actions">
        <button class="cancel-note-btn">Cancel</button>
        <button class="save-note-btn">Save</button>
      </div>
    `;

    const input = noteDiv.querySelector('.note-input') as HTMLInputElement;
    const cancelBtn = noteDiv.querySelector('.cancel-note-btn') as HTMLButtonElement;
    const saveBtn = noteDiv.querySelector('.save-note-btn') as HTMLButtonElement;

    input.focus();

    const saveNote = () => {
      const newNote = input.value.trim();
      if (newNote !== station.note) {
        station.note = newNote || undefined;
        this.saveStations();
        eventManager.emit('station:updated', station);
      }
      
      if (newNote) {
        noteDiv.innerHTML = newNote;
        noteDiv.className = 'station-note';
      } else {
        noteDiv.remove();
      }
    };

    const cancelEdit = () => {
      if (station.note) {
        noteDiv.innerHTML = station.note;
        noteDiv.className = 'station-note';
      } else {
        noteDiv.remove();
      }
    };

    // Event listeners
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        saveNote();
      } else if (e.key === 'Escape') {
        cancelEdit();
      }
    });

    saveBtn.addEventListener('click', saveNote);
    cancelBtn.addEventListener('click', cancelEdit);
  }

  /**
   * Visit station website
   */
  private visitStationWebsite(station: LocalStation): void {
    if (station.homepage) {
      window.open(station.homepage, '_blank', 'noopener,noreferrer');
    } else {
      eventManager.emit('notification:show', {
        type: 'warning',
        message: 'No website available for this station',
        duration: 3000
      });
    }
  }

  /**
   * Confirm and remove station
   */
  private confirmAndRemoveStation(station: LocalStation): void {
    eventManager.emit('modal:open', {
      type: 'confirm',
      title: 'Delete Station',
      content: `Are you sure you want to remove "${station.name}" from your collection?`,
      actions: [
        {
          label: 'Cancel',
          action: () => eventManager.emit('modal:close'),
          style: 'secondary'
        },
        {
          label: 'Delete',
          action: () => {
            this.removeStation(station.id);
            eventManager.emit('modal:close');
          },
          style: 'danger'
        }
      ],
      size: 'small',
      closable: true
    });
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalStations: number;
    favoriteStations: number;
    countriesRepresented: number;
    totalPlayTime: number;
  } {
    const countries = new Set(this.stations.map(s => s.country).filter(Boolean));
    const favoriteStations = this.stations.filter(s => s.isFavorite).length;
    const totalPlayTime = this.stations.reduce((sum, s) => sum + (s.playCount || 0), 0);

    return {
      totalStations: this.stations.length,
      favoriteStations,
      countriesRepresented: countries.size,
      totalPlayTime
    };
  }

  /**
   * Check if a station is currently playing
   */
  private isStationCurrentlyPlaying(station: LocalStation): boolean {
    if (!this.currentPlayingStation) return false;
    
    return this.currentPlayingStation.stationuuid === station.stationuuid ||
           (this.currentPlayingStation.url === station.url && this.currentPlayingStation.name === station.name);
  }

  /**
   * Update play button icon based on station state
   */
  private updatePlayButtonIcon(playBtn: HTMLElement, station: LocalStation): void {
    const icon = playBtn.querySelector('.material-symbols-rounded');
    if (!icon) return;

    const isCurrentlyPlaying = this.isStationCurrentlyPlaying(station);
    
    if (isCurrentlyPlaying && this.isCurrentlyPlaying) {
      icon.textContent = 'pause';
    } else {
      icon.textContent = 'play_arrow';
    }
  }

  /**
   * Update UI for currently playing station
   */
  private updatePlayingStationUI(): void {
    // Update all station cards in main container and library containers
    const allCards = [
      ...this.container.querySelectorAll('.station-card'),
      ...document.querySelectorAll('#library-stations-container .station-card'),
      ...document.querySelectorAll('#library-presets-container .station-card')
    ];
    
    // Update all preset tiles in main container and library containers
    const allPresetTiles = [
      ...this.container.querySelectorAll('.preset-tile'),
      ...document.querySelectorAll('#library-presets-container .preset-tile')
    ];
    allCards.forEach((cardElement) => {
      const card = cardElement as HTMLElement;
      const stationId = card.dataset.stationId;
      const station = this.stations.find(s => s.id === stationId);
      
      if (station) {
        const isCurrentlyPlaying = this.isStationCurrentlyPlaying(station);
        const stationNameContainer = card.querySelector('.station-name-container');
        
        // Update card class
        if (isCurrentlyPlaying && this.isCurrentlyPlaying) {
          card.classList.add('playing');
          
          // Add equalizer icon if not present
          if (stationNameContainer && !stationNameContainer.querySelector('.now-playing-icon')) {
            const equalizerIcon = createElement('div', { 
              className: 'now-playing-icon',
              title: 'Now playing'
            });
            equalizerIcon.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 14V15H1V14H3Z M3 13V14H1V13H3Z M3 12V13H1V12H3Z M3 11V12H1V11H3Z M3 10V11H1V10H3Z M3 9V10H1V9H3Z M3 8V9H1V8H3Z M3 7V8H1V7H3Z M3 6V7H1V6H3Z M3 5V6H1V5H3Z M3 4V5H1V4H3Z M3 3V4H1V3H3Z M3 2V3H1V2H3Z" fill="#00FFA2"/>
                <path d="M6 14V15H4V14H6Z M6 13V14H4V13H6Z M6 12V13H4V12H6Z M6 11V12H4V11H6Z M6 10V11H4V10H6Z M6 9V10H4V9H6Z M6 8V9H4V8H6Z M6 7V8H4V7H6Z M6 6V7H4V6H6Z M6 5V6H4V5H6Z M6 4V5H4V4H6Z M6 3V4H4V3H6Z M6 2V3H4V2H6Z" fill="#00FFA2"/>
                <path d="M9 14V15H7V14H9Z M9 13V14H7V13H9Z M9 12V13H7V12H9Z M9 11V12H7V11H9Z M9 10V11H7V10H9Z M9 9V10H7V9H9Z M9 8V9H7V8H9Z M9 7V8H7V7H9Z M9 6V7H7V6H9Z M9 5V6H7V5H9Z M9 4V5H7V4H9Z M9 3V4H7V3H9Z M9 2V3H7V2H9Z" fill="#00FFA2"/>
                <path d="M12 14V15H10V14H12Z M12 13V14H10V13H12Z M12 12V13H10V12H12Z M12 11V12H10V11H12Z M12 10V11H10V10H12Z M12 9V10H10V9H12Z M12 8V9H10V8H12Z M12 7V8H10V7H12Z M12 6V7H10V6H12Z M12 5V6H10V5H12Z M12 4V5H10V4H12Z M12 3V4H10V3H12Z M12 2V3H10V2H12Z" fill="#00FFA2"/>
                <path d="M15 14V15H13V14H15Z M15 13V14H13V13H15Z M15 12V13H13V12H15Z M15 11V12H13V11H15Z M15 10V11H13V10H15Z M15 9V10H13V9H15Z M15 8V9H13V8H15Z M15 7V8H13V7H15Z M15 6V7H13V6H15Z M15 5V6H13V5H15Z M15 4V5H13V4H15Z M15 3V4H13V3H15Z M15 2V3H13V2H15Z" fill="#00FFA2"/>
                <path d="M3 1V2H1V1H3Z" fill="#9E66F2"/>
                <path d="M6 1V2H4V1H6Z" fill="#9E66F2"/>
                <path d="M9 1V2H7V1H9Z" fill="#9E66F2"/>
                <path d="M12 1V2H10V1H12Z" fill="#9E66F2"/>
                <path d="M15 1V2H13V1H15Z" fill="#9E66F2"/>
              </svg>
            `;
            // Insert before pin indicator if it exists
            const pinIndicator = stationNameContainer.querySelector('.pin-indicator');
            if (pinIndicator) {
              stationNameContainer.insertBefore(equalizerIcon, pinIndicator);
            } else {
              stationNameContainer.appendChild(equalizerIcon);
            }
          }
        } else {
          card.classList.remove('playing');
          
          // Remove equalizer icon if present
          const existingIcon = stationNameContainer?.querySelector('.now-playing-icon');
          if (existingIcon) {
            existingIcon.remove();
          }
        }
        
        // Update play button icon
        const playBtn = card.querySelector('.play-btn');
        if (playBtn) {
          this.updatePlayButtonIcon(playBtn as HTMLElement, station);
        }
      }
    });

    // Update preset tiles
    allPresetTiles.forEach((tileElement) => {
      const tile = tileElement as HTMLElement;
      const stationInfoContainer = tile.querySelector('.preset-station-info-container');
      
      if (stationInfoContainer) {
        // This tile has a station, find which station it is
        const stationNameElement = tile.querySelector('.preset-station-name');
        if (stationNameElement) {
          const stationName = stationNameElement.textContent?.trim();
          const station = this.stations.find(s => 
            (s.customName || s.name) === stationName && s.presetSlot !== undefined
          );
          
          if (station) {
            const isCurrentlyPlaying = this.isStationCurrentlyPlaying(station);
            
            // Update tile class
            if (isCurrentlyPlaying && this.isCurrentlyPlaying) {
              tile.classList.add('playing');
            } else {
              tile.classList.remove('playing');
            }
          }
        }
      }
    });
  }

  /**
   * Get all stations (alias for getAllStations for consistency)
   */
  getStations(): LocalStation[] {
    return this.getAllStations();
  }

  /**
   * Share multiple stations as a collection
   */
  async shareStations(stations: LocalStation[], listName?: string, username?: string): Promise<any> {
    const effectiveUsername = username || this.getUsernameFromManager() || 'Anonymous';
    const defaultName = effectiveUsername ? `${effectiveUsername}'s Stations` : 'My Stations';
    return await sharingService.shareStations(effectiveUsername, stations, listName || defaultName);
  }


  /**
   * Get username from user manager for sharing
   */
  private getUsernameFromManager(): string {
    // Try to get username from local storage or default
    return getStorageItem(StorageKeys.USERNAME, '');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    eventManager.removeAllListeners('station:remove');
    eventManager.removeAllListeners('station:remove-by-uuid');
    eventManager.removeAllListeners('station:update');
    eventManager.removeAllListeners('stations:clear');
    eventManager.removeAllListeners('stations:import');
    eventManager.removeAllListeners('stations:display');
    eventManager.removeAllListeners('library:render-stations');
    eventManager.removeAllListeners('library:render-presets');
    eventManager.removeAllListeners('library:get-stations');
    eventManager.removeAllListeners('station:selected');
    eventManager.removeAllListeners('station:play');
    eventManager.removeAllListeners('station:pause');
    eventManager.removeAllListeners('station:stop');
  }
}