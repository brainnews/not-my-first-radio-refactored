/**
 * Search view component for discovering and browsing radio stations
 */

import { RadioStation, LocalStation } from '@/types/station';
import { SearchResult, SearchFilters } from '@/modules/search/SearchManager';
import { createElement, querySelector } from '@/utils/dom';
import { eventManager } from '@/utils/events';
import { getCountryIcon, getBitrateIcon, getVotesIcon } from '@/utils/icons';
import { PlaceholderManager } from '@/utils/placeholderManager';
import { STREAM_SCANNER_BOOKMARKLET } from '@/constants/bookmarklet';
import { getStorageItem, setStorageItem, StorageKeys } from '@/utils/storage';
import { ValidationProgress, StationValidationState, StationValidationStatus } from '@/types/validation';

interface StarterPack {
  filename: string;
  data: {
    stations: RadioStation[];
    version: string;
    username: string;
    description: string;
    thumbnail_path: string;
  };
}

export interface SearchViewConfig {
  container?: HTMLElement;
}

interface SearchSortPreference {
  order: string;
}

/**
 * Search view component for station discovery and browsing
 */
export class SearchView {
  private container: HTMLElement;
  private searchInput!: HTMLInputElement;
  private resultsContainer!: HTMLElement;
  private loadingIndicator!: HTMLElement;
  private emptyState!: HTMLElement;
  private loadMoreButton!: HTMLButtonElement;
  private placeholderManager!: PlaceholderManager;
  
  private currentResults: RadioStation[] = [];
  private currentQuery = '';
  private currentFilters: SearchFilters = {};
  private hasMore = false;
  private previewingStation: RadioStation | null = null;
  private loadingPreviewStation: RadioStation | null = null;
  private libraryStations: Set<string> = new Set(); // Track station UUIDs in library
  
  // Validation state
  private isValidating = false;
  private validationProgress: ValidationProgress | null = null;
  private validationIndicator!: HTMLElement;
  private stationValidationStates: Map<string, StationValidationStatus> = new Map();

  constructor(config: SearchViewConfig = {}) {
    this.container = config.container || this.createContainer();
    this.render();
    this.setupEventListeners();
    this.requestLibraryState();
    this.loadStarterPacks();
    this.restoreSearchSortPreferences();
  }

  /**
   * Create search view container
   */
  private createContainer(): HTMLElement {
    const container = createElement('div', {
      className: 'search-view',
      id: 'search-view'
    });

    // Append to main section alongside other views
    const main = document.querySelector('main');
    if (main) {
      main.appendChild(container);
    } else {
      document.body.appendChild(container);
    }

    return container;
  }

  /**
   * Render the search view
   */
  private render(): void {
    this.container.innerHTML = `
      <div class="search-header">
        <div class="search-title-section">
          <h2 class="search-title">Explore</h1>
        </div>
      </div>
      <div class="search-input-container">
        <input type="text" id="search-input" placeholder="" autocomplete="off">
        <button type="button" id="search-clear" class="search-clear" aria-label="Clear search">
          <span class="icon">✕</span>
        </button>
      </div>

      <div class="search-filters" id="search-filters">
        <div class="filters-header">
          <button type="button" id="clear-filters" class="clear-filters-button" style="display: none;">
            <span class="material-symbols-rounded">close_small</span>
            Clear Filters
          </button>
          <button type="button" class="filters-toggle" id="filters-toggle">
            <span class="filters-toggle-text">Advanced Filters</span>
            <span class="material-symbols-rounded filters-toggle-icon">expand_more</span>
          </button>
        </div>
        
        <div class="filters-content collapsed" id="filters-content">
          <div class="filter-group">
            <label for="country-filter">Country:</label>
            <select id="country-filter">
              <option value="">Any Country</option>
            </select>
          </div>
          
          <div class="filter-group">
            <label for="genre-filter">Genre:</label>
            <select id="genre-filter">
              <option value="">Any Genre</option>
            </select>
          </div>
          
          <div class="filter-group">
            <label for="bitrate-filter">Min Bitrate:</label>
            <select id="bitrate-filter">
              <option value="">Any Quality</option>
              <option value="64">64 kbps+</option>
              <option value="128">128 kbps+</option>
              <option value="192">192 kbps+</option>
              <option value="320">320 kbps+</option>
            </select>
          </div>
        </div>
      </div>

      <div class="search-content">
        <div id="loading-indicator" class="loading-indicator hidden">
          <div class="spinner"></div>
          <span>Searching stations...</span>
        </div>

        <div id="validation-indicator" class="validation-indicator hidden">
          <div class="spinner"></div>
          <div class="validation-content">
            <span class="validation-text">Validating streams...</span>
            <div class="validation-progress">
              <div class="validation-progress-bar">
                <div class="validation-progress-fill"></div>
              </div>
              <div class="validation-progress-text">0 of 0 stations verified</div>
            </div>
          </div>
        </div>

        <div id="empty-state" class="empty-state">
          <div class="empty-state-content">
            <p>Start typing to search, or explore these curated station collections</p>
            <div class="starter-packs-grid" id="starter-packs-grid">
              <div class="loading-indicator">
                <div class="loading-spinner"></div>
                <div class="loading-text">Loading starter packs...</div>
              </div>
            </div>
          </div>
        </div>

        <div id="search-results" class="search-results">
          <div class="results-header hidden">
            <span id="results-count"></span>
            <div class="results-controls">
              <div class="filter-group">
                <label for="sort-filter">Sort by:</label>
                <select id="sort-filter" title="Choose how to sort search results">
                  <option value="votes">Popularity (Most Voted)</option>
                  <option value="clicktrend">Trending (Currently Popular)</option>
                  <option value="bitrate">Quality (Bitrate)</option>
                  <option value="lastcheckok">Reliability (Recently Checked)</option>
                  <option value="random">Random</option>
                </select>
              </div>
            </div>
          </div>
          <div id="stations-list" class="stations-list"></div>
          <button type="button" id="load-more" class="load-more-button hidden">
            Load more
          </button>
        </div>
      </div>
    `;

    // Get references to elements
    this.searchInput = querySelector('#search-input', this.container) as HTMLInputElement;
    this.resultsContainer = querySelector('#search-results', this.container);
    this.loadingIndicator = querySelector('#loading-indicator', this.container);
    this.validationIndicator = querySelector('#validation-indicator', this.container);
    this.emptyState = querySelector('#empty-state', this.container);
    this.loadMoreButton = querySelector('#load-more', this.container) as HTMLButtonElement;

    this.setupFilterOptions();
    this.initializePlaceholderManager();
  }

  /**
   * Initialize the dynamic placeholder manager
   */
  private initializePlaceholderManager(): void {
    this.placeholderManager = new PlaceholderManager(this.searchInput, {
      rotationInterval: 3500, // 3.5 seconds
      enableTransitions: true,
      pauseOnFocus: true
    });
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Search input
    this.searchInput.addEventListener('input', (e) => {
      const query = (e.target as HTMLInputElement).value;
      this.handleSearch(query);
    });

    // Clear search button
    const clearButton = querySelector('#search-clear', this.container);
    clearButton.addEventListener('click', () => {
      this.clearSearch();
    });

    // Filters toggle button
    const filtersToggle = querySelector('#filters-toggle', this.container);
    filtersToggle.addEventListener('click', () => {
      this.toggleFilters();
    });

    // Filter changes
    const countryFilter = querySelector('#country-filter', this.container) as HTMLSelectElement;
    const genreFilter = querySelector('#genre-filter', this.container) as HTMLSelectElement;
    const bitrateFilter = querySelector('#bitrate-filter', this.container) as HTMLSelectElement;
    const sortFilter = querySelector('#sort-filter', this.container) as HTMLSelectElement;

    [countryFilter, genreFilter, bitrateFilter, sortFilter].forEach(filter => {
      filter.addEventListener('change', () => {
        this.updateFilters();
      });
    });

    // Clear filters button
    const clearFiltersButton = querySelector('#clear-filters', this.container);
    clearFiltersButton.addEventListener('click', () => {
      this.clearFilters();
    });

    // Load more button
    this.loadMoreButton.addEventListener('click', () => {
      this.loadMore();
    });

    // Search events
    eventManager.on('search:started', this.handleSearchStarted.bind(this));
    eventManager.on('search:completed', this.handleSearchCompleted.bind(this));
    eventManager.on('search:more-loaded', this.handleMoreLoaded.bind(this));
    eventManager.on('search:error', this.handleSearchError.bind(this));
    eventManager.on('search:cleared', this.handleSearchCleared.bind(this));
    eventManager.on('search:preview-state', this.handlePreviewState.bind(this));

    // Validation events
    eventManager.on('search:validating', this.handleValidationStarted.bind(this));
    eventManager.on('search:validation-progress', this.handleValidationProgress.bind(this));
    eventManager.on('search:validation-complete', this.handleValidationComplete.bind(this));
    eventManager.on('search:validation-cancelled', this.handleValidationCancelled.bind(this));
    eventManager.on('search:station-validated', this.handleStationValidated.bind(this));
    eventManager.on('search:station-validation-failed', this.handleStationValidationFailed.bind(this));
    eventManager.on('search:immediate-results', this.handleImmediateResults.bind(this));

    // Player events
    eventManager.on('player:state-changed', this.handlePlayerStateChanged.bind(this));

    // Library events
    eventManager.on('station:added', this.handleStationAdded.bind(this));
    eventManager.on('station:removed', this.handleStationRemoved.bind(this));
    eventManager.on('stations:loaded', this.handleStationsLoaded.bind(this));
  }

  /**
   * Set up filter options
   */
  private async setupFilterOptions(): Promise<void> {
    // Load countries from SearchManager API
    eventManager.emit('search:get-countries');
    eventManager.once('search:countries-response', (countries: Array<{ name: string; stationcount: number }>) => {
      this.populateCountryFilter(countries);
    });

    // Load genres from SearchManager API
    eventManager.emit('search:get-genres');
    eventManager.once('search:genres-response', (genres: Array<{ name: string; stationcount: number }>) => {
      this.populateGenreFilter(genres);
      // Update filter indicators after all filters are populated
      this.updateFilterIndicators();
    });
  }

  /**
   * Populate country filter with comprehensive list
   */
  private populateCountryFilter(countries: Array<{ name: string; stationcount: number }>): void {
    const countryFilter = querySelector('#country-filter', this.container) as HTMLSelectElement;
    
    // Clear existing options and add "Any Country" option
    countryFilter.innerHTML = '';
    const anyOption = createElement('option', { value: '', textContent: 'Any Country' });
    countryFilter.appendChild(anyOption);

    // Sort countries alphabetically and add them
    countries
      .filter(country => country.stationcount > 0) // Only include countries with stations
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(country => {
        const option = createElement('option', { 
          value: country.name, 
          textContent: country.name 
        });
        countryFilter.appendChild(option);
      });
  }

  /**
   * Populate genre filter with comprehensive list
   */
  private populateGenreFilter(genres: Array<{ name: string; stationcount: number }>): void {
    const genreFilter = querySelector('#genre-filter', this.container) as HTMLSelectElement;
    
    // Clear existing options and add "Any Genre" option
    genreFilter.innerHTML = '';
    const anyOption = createElement('option', { value: '', textContent: 'Any Genre' });
    genreFilter.appendChild(anyOption);

    // Sort genres by station count (descending) then alphabetically
    genres
      .filter(genre => genre.stationcount > 0) // Only include genres with stations
      .sort((a, b) => {
        if (b.stationcount !== a.stationcount) {
          return b.stationcount - a.stationcount; // Sort by station count (descending)
        }
        return a.name.localeCompare(b.name); // Then alphabetically
      })
      .slice(0, 100) // Limit to top 100 genres to avoid overwhelming the dropdown
      .forEach(genre => {
        const option = createElement('option', { 
          value: genre.name.toLowerCase(), 
          textContent: genre.name.length > 20 ? genre.name.substring(0, 20) + '...' : genre.name
        });
        genreFilter.appendChild(option);
      });
  }

  /**
   * Handle search input
   */
  private handleSearch(query: string): void {
    this.currentQuery = query;
    eventManager.emit('search:execute', { query, filters: this.currentFilters });
  }

  /**
   * Update filters
   */
  private updateFilters(): void {
    const countryFilter = querySelector('#country-filter', this.container) as HTMLSelectElement;
    const genreFilter = querySelector('#genre-filter', this.container) as HTMLSelectElement;
    const bitrateFilter = querySelector('#bitrate-filter', this.container) as HTMLSelectElement;
    const sortFilter = querySelector('#sort-filter', this.container) as HTMLSelectElement;

    this.currentFilters = {
      country: countryFilter.value || undefined,
      genre: genreFilter.value || undefined,
      minBitrate: bitrateFilter.value ? parseInt(bitrateFilter.value) : undefined,
      order: sortFilter.value as 'votes' | 'clicktrend' | 'bitrate' | 'lastcheckok' | 'random',
      reverse: true // All remaining sort options use descending order
    };

    // Save search sort preferences
    this.saveSearchSortPreferences();

    // Always trigger search when filters change, even without text query
    eventManager.emit('search:execute', { query: this.currentQuery, filters: this.currentFilters });
    
    // Update filter visual indicators
    this.updateFilterIndicators();
  }

  /**
   * Clear search
   */
  private clearSearch(): void {
    this.searchInput.value = '';
    this.currentQuery = '';
    eventManager.emit('search:clear');
  }

  /**
   * Clear all filters
   */
  private clearFilters(): void {
    const countryFilter = querySelector('#country-filter', this.container) as HTMLSelectElement;
    const genreFilter = querySelector('#genre-filter', this.container) as HTMLSelectElement;
    const bitrateFilter = querySelector('#bitrate-filter', this.container) as HTMLSelectElement;
    const sortFilter = querySelector('#sort-filter', this.container) as HTMLSelectElement;

    // Reset all filters to default values
    countryFilter.value = '';
    genreFilter.value = '';
    bitrateFilter.value = '';
    sortFilter.value = 'votes'; // Default sort

    // Update filters and trigger search
    this.updateFilters();
  }

  /**
   * Update visual indicators for active filters
   */
  private updateFilterIndicators(): void {
    const clearFiltersButton = querySelector('#clear-filters', this.container) as HTMLButtonElement;
    const filtersToggle = querySelector('#filters-toggle', this.container);
    
    // Check if any filters are active (excluding sort order, which is not a filter)
    const hasActiveFilters = !!(
      this.currentFilters.country ||
      this.currentFilters.genre ||
      this.currentFilters.minBitrate
    );

    // Show/hide clear filters button based on active state
    if (hasActiveFilters) {
      clearFiltersButton.style.display = 'flex';
      filtersToggle.classList.add('has-active-filters');
    } else {
      clearFiltersButton.style.display = 'none';
      filtersToggle.classList.remove('has-active-filters');
    }

    // Update filters toggle text to show count
    const filtersToggleText = querySelector('.filters-toggle-text', this.container);
    if (hasActiveFilters) {
      const activeCount = [
        this.currentFilters.country,
        this.currentFilters.genre,
        this.currentFilters.minBitrate
      ].filter(Boolean).length;
      
      filtersToggleText.textContent = `Advanced Filters (${activeCount})`;
    } else {
      filtersToggleText.textContent = 'Advanced Filters';
    }
  }


  /**
   * Toggle advanced filters visibility
   */
  private toggleFilters(): void {
    const filtersContent = querySelector('#filters-content', this.container);
    const toggleIcon = querySelector('.filters-toggle-icon', this.container);
    
    const isExpanded = !filtersContent.classList.contains('collapsed');
    
    if (isExpanded) {
      filtersContent.classList.add('collapsed');
      toggleIcon.textContent = 'expand_more';
    } else {
      filtersContent.classList.remove('collapsed');
      toggleIcon.textContent = 'expand_less';
    }
  }

  /**
   * Load more results
   */
  private loadMore(): void {
    eventManager.emit('search:load-more');
  }

  /**
   * Request current library state
   */
  private requestLibraryState(): void {
    // Request current library state from StationManager
    eventManager.emit('library:get-stations');
    
    // Listen for the response
    eventManager.once('library:stations-response', (stations: LocalStation[]) => {
      this.handleStationsLoaded(stations);
    });

    // Add a timeout in case the StationManager isn't ready yet
    setTimeout(() => {
      eventManager.emit('library:get-stations');
    }, 100);
  }

  /**
   * Load starter packs for initial display
   */
  private async loadStarterPacks(): Promise<void> {
    const starterPacksGrid = querySelector('#starter-packs-grid', this.container);
    
    try {
      // List of starter pack files
      const starterPackFiles = [
        'ambient.json',
        'austin.json', 
        'blues.json',
        'classical.json',
        'college-radio.json',
        'jazz.json',
        'jungle-dnb.json',
        'kpop.json',
        'noise.json'
      ];

      // Load all starter packs
      const starterPackPromises = starterPackFiles.map(async (filename) => {
        try {
          const response = await fetch(`./starter-packs/${filename}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          return { filename, data };
        } catch (error) {
          console.error(`Error loading starter pack ${filename}:`, error);
          return null;
        }
      });

      const starterPackResults = await Promise.all(starterPackPromises);
      const validPacks = starterPackResults.filter((pack): pack is StarterPack => pack !== null);

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
   * Handle search started event
   */
  private handleSearchStarted(data?: { query: string; filters: any; isLoadMore?: boolean }): void {
    this.showLoading();
    // Only clear validation states for new searches, not load more operations
    if (!data?.isLoadMore) {
      this.stationValidationStates.clear();
    }
  }

  /**
   * Handle search completed event
   */
  private handleSearchCompleted(result: SearchResult): void {
    this.currentResults = result.stations;
    this.hasMore = result.hasMore;
    this.renderResults();
  }

  /**
   * Handle more results loaded
   */
  private handleMoreLoaded(result: SearchResult): void {
    this.currentResults.push(...result.stations);
    this.hasMore = result.hasMore;
    this.renderMoreResults(result.stations);
  }

  /**
   * Handle search error
   */
  private handleSearchError(): void {
    this.hideLoading();
    // Error is handled by notification system
  }

  /**
   * Handle search cleared
   */
  private handleSearchCleared(): void {
    this.currentResults = [];
    this.hasMore = false;
    this.renderResults();
    this.loadStarterPacks();
  }

  /**
   * Handle preview state changes
   */
  private handlePreviewState(data: { state: string; station: RadioStation | null }): void {
    const { state, station } = data;
    
    if (state === 'loading') {
      this.loadingPreviewStation = station;
      this.previewingStation = null;
    } else if (state === 'playing') {
      this.previewingStation = station;
      this.loadingPreviewStation = null;
    } else if (state === 'stopped' || state === 'error') {
      this.previewingStation = null;
      this.loadingPreviewStation = null;
    }
    
    this.updateStationPreviewStates();
  }

  /**
   * Handle player state changes
   */
  private handlePlayerStateChanged(): void {
    this.updateStationStates();
  }

  /**
   * Handle station added to library
   */
  private handleStationAdded(station: LocalStation): void {
    this.libraryStations.add(station.stationuuid);
    this.updateStationLibraryStates();
  }

  /**
   * Handle station removed from library
   */
  private handleStationRemoved(station: LocalStation): void {
    this.libraryStations.delete(station.stationuuid);
    this.updateStationLibraryStates();
  }

  /**
   * Handle stations loaded (to populate initial library state)
   */
  private handleStationsLoaded(stations: LocalStation[]): void {
    // Clear and repopulate the library stations set
    this.libraryStations.clear();
    stations.forEach(station => {
      this.libraryStations.add(station.stationuuid);
    });
    
    // Update any existing station cards
    this.updateStationLibraryStates();
  }

  /**
   * Handle validation started
   */
  private handleValidationStarted(data: { 
    total: number; 
    query: string; 
    filters: any; 
    loadMore?: boolean; 
    stationsToValidate?: string[] 
  }): void {
    this.isValidating = true;
    this.hideLoading(); // Hide the search loading indicator
    //this.showValidation(data.total);
    
    if (data.loadMore && data.stationsToValidate) {
      // For load more, only mark the new stations as validating
      data.stationsToValidate.forEach(stationUuid => {
        this.stationValidationStates.set(stationUuid, StationValidationStatus.VALIDATING);
        this.updateStationValidationIndicator(stationUuid, StationValidationStatus.VALIDATING);
      });
    } else {
      // For initial search, mark all current stations as validating
      this.currentResults.forEach(station => {
        this.stationValidationStates.set(station.stationuuid, StationValidationStatus.VALIDATING);
        this.updateStationValidationIndicator(station.stationuuid, StationValidationStatus.VALIDATING);
      });
    }
  }

  /**
   * Handle validation progress updates
   */
  private handleValidationProgress(progress: ValidationProgress): void {
    this.validationProgress = progress;
    this.updateValidationProgress();
  }

  /**
   * Handle validation complete
   */
  private handleValidationComplete(data: { validatedCount: number; invalidCount: number; totalCount: number }): void {
    this.isValidating = false;
    this.hideValidation();
    
    // Show completion message if enabled (optional)
    console.log(`[SearchView] Validation complete: ${data.validatedCount}/${data.totalCount} stations valid`);
  }

  /**
   * Handle validation cancelled
   */
  private handleValidationCancelled(data: { error: string }): void {
    this.isValidating = false;
    this.hideValidation();
    console.warn(`[SearchView] Validation cancelled: ${data.error}`);
  }

  /**
   * Handle immediate results (shown before validation)
   */
  private handleImmediateResults(result: SearchResult): void {
    // Initialize all stations as unknown validation status (only if not already set)
    result.stations.forEach(station => {
      if (!this.stationValidationStates.has(station.stationuuid)) {
        this.stationValidationStates.set(station.stationuuid, StationValidationStatus.UNKNOWN);
      }
    });
    // Results are already handled by handleSearchCompleted or handleMoreLoaded
  }

  /**
   * Handle individual station validation success
   */
  private handleStationValidated(state: StationValidationState): void {
    this.stationValidationStates.set(state.stationUuid, StationValidationStatus.VALID);
    this.updateStationValidationIndicator(state.stationUuid, StationValidationStatus.VALID);
  }

  /**
   * Handle individual station validation failure
   */
  private handleStationValidationFailed(state: StationValidationState): void {
    this.stationValidationStates.set(state.stationUuid, StationValidationStatus.INVALID);
    this.updateStationValidationIndicator(state.stationUuid, StationValidationStatus.INVALID, state.error?.message);
  }

  /**
   * Update validation indicator for a specific station
   */
  private updateStationValidationIndicator(stationUuid: string, status: StationValidationStatus, errorMessage?: string): void {
    const stationCard = this.container.querySelector(`[data-station-id="${stationUuid}"]`);
    if (!stationCard) return;

    const validationIndicator = stationCard.querySelector('.station-validation-indicator') as HTMLElement;
    const previewButton = stationCard.querySelector('.preview-button') as HTMLElement;
    const addButton = stationCard.querySelector('.add-button') as HTMLElement;
    if (!validationIndicator) return;

    // Remove all status classes
    validationIndicator.classList.remove('validating', 'valid', 'invalid', 'unknown');
    
    // Add current status class
    validationIndicator.classList.add(status);
    
    // Update indicator content and title
    switch (status) {
      case StationValidationStatus.VALIDATING:
        validationIndicator.innerHTML = '<div class="validation-spinner"></div>';
        validationIndicator.title = 'Validating stream...';
        // Keep both buttons visible during validation
        if (previewButton) previewButton.classList.remove('hidden');
        if (addButton) addButton.classList.remove('hidden');
        break;
      case StationValidationStatus.VALID:
        validationIndicator.innerHTML = '';
        validationIndicator.title = '';
        // Show both buttons for valid streams
        if (previewButton) previewButton.classList.remove('hidden');
        if (addButton) addButton.classList.remove('hidden');
        break;
      case StationValidationStatus.INVALID:
        validationIndicator.innerHTML = '<span class="station-not-supported">Station not supported</span>';
        validationIndicator.title = errorMessage || 'Stream unavailable';
        // Hide both buttons for invalid streams
        if (previewButton) previewButton.classList.add('hidden');
        if (addButton) addButton.classList.add('hidden');
        break;
      default:
        validationIndicator.innerHTML = '<div class="validation-unknown"></div>';
        validationIndicator.title = 'Stream not yet validated';
        // Keep both buttons visible for unknown status
        if (previewButton) previewButton.classList.remove('hidden');
        if (addButton) addButton.classList.remove('hidden');
        break;
    }
  }


  /**
   * Hide validation indicator
   */
  private hideValidation(): void {
    this.validationIndicator.classList.add('hidden');
  }

  /**
   * Update validation progress display
   */
  private updateValidationProgress(): void {
    if (!this.validationProgress || !this.isValidating) {
      return;
    }

    const progress = this.validationProgress;
    const progressText = querySelector('.validation-progress-text', this.validationIndicator) as HTMLElement;
    const progressFill = querySelector('.validation-progress-fill', this.validationIndicator) as HTMLElement;
    
    progressText.textContent = `${progress.validated} of ${progress.total} stations verified`;
    progressFill.style.width = `${progress.percentComplete}%`;
  }

  /**
   * Show loading indicator
   */
  private showLoading(): void {
    this.loadingIndicator.classList.remove('hidden');
    this.validationIndicator.classList.add('hidden');
    this.emptyState.classList.add('hidden');
    this.resultsContainer.classList.add('hidden');
  }

  /**
   * Hide loading indicator
   */
  private hideLoading(): void {
    this.loadingIndicator.classList.add('hidden');
  }

  /**
   * Generate appropriate search result message based on search type
   */
  private generateSearchResultMessage(): string {
    const count = this.currentResults.length;
    const hasMore = this.hasMore ? '+' : '';
    const hasQuery = this.currentQuery.trim().length > 0;
    const hasFilters = !!(this.currentFilters.country || this.currentFilters.genre || this.currentFilters.minBitrate);

    if (hasQuery && hasFilters) {
      // Text search + filters
      const filterParts = [];
      if (this.currentFilters.genre) filterParts.push(this.currentFilters.genre);
      if (this.currentFilters.country) filterParts.push(`from ${this.currentFilters.country}`);
      if (this.currentFilters.minBitrate) filterParts.push(`${this.currentFilters.minBitrate}+ kbps`);
      
      return `Found ${count}${hasMore} stations matching "${this.currentQuery}"${filterParts.length ? ` (${filterParts.join(', ')})` : ''}`;
    } else if (hasFilters) {
      // Filter-only search
      const filterParts = [];
      if (this.currentFilters.genre) filterParts.push(`${this.currentFilters.genre} stations`);
      if (this.currentFilters.country) filterParts.push(`from ${this.currentFilters.country}`);
      if (this.currentFilters.minBitrate) filterParts.push(`${this.currentFilters.minBitrate}+ kbps`);
      
      const description = filterParts.length > 0 ? filterParts.join(' ') : 'filtered stations';
      return `Showing ${count}${hasMore} ${description}`;
    } else if (hasQuery) {
      // Text search only
      return `Found ${count}${hasMore} stations matching "${this.currentQuery}"`;
    } else {
      // No search criteria (shouldn't happen with new logic, but fallback)
      return `Showing ${count}${hasMore} stations`;
    }
  }

  /**
   * Render empty search results with contextual messaging
   */
  private renderEmptySearchResults(): void {
    const emptyContent = querySelector('.empty-state-content', this.container);
    const hasQuery = this.currentQuery.trim().length > 0;
    const hasFilters = !!(this.currentFilters.country || this.currentFilters.genre || this.currentFilters.minBitrate);
    
    if (hasQuery || hasFilters) {
      // User searched but got no results - show Stream Scanner suggestion
      emptyContent.innerHTML = `
        <div class="no-results-message">
          <span class="material-symbols-rounded no-results-icon">search_off</span>
          <h3>No stations found</h3>
          <p>Try different search terms or filters, or discover stations directly from radio websites.</p>
          
          <div class="stream-scanner-suggestion">
            <div class="suggestion-icon">
              <span class="material-symbols-rounded">find_in_page</span>
            </div>
            <div class="suggestion-content">
              <h4>Try Stream Scanner</h4>
              <p>Browse radio station websites and use Stream Scanner to automatically detect and add streams.</p>
              <div class="bookmarklet-widget compact inline">
                <p class="bookmarklet-instruction">Drag this to your bookmarks bar:</p>
                <a href="${STREAM_SCANNER_BOOKMARKLET.code}" class="bookmarklet-link" draggable="true">${STREAM_SCANNER_BOOKMARKLET.name}</a>
                <p class="bookmarklet-usage-text">Then visit radio station websites and click it!</p>
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      // Default empty state - show starter packs
      emptyContent.innerHTML = `
        <p>Start typing to search, or explore these curated station collections</p>
        <div class="starter-packs-grid" id="starter-packs-grid">
          <div class="loading-indicator">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading starter packs...</div>
          </div>
        </div>
      `;
      // Reload starter packs for default state
      this.loadStarterPacks();
    }
  }

  /**
   * Render search results
   */
  private renderResults(): void {
    this.hideLoading();

    if (this.currentResults.length === 0) {
      this.renderEmptySearchResults();
      this.emptyState.classList.remove('hidden');
      this.resultsContainer.classList.add('hidden');
      return;
    }

    this.emptyState.classList.add('hidden');
    this.resultsContainer.classList.remove('hidden');

    // Update results count with smart messaging
    const resultsHeader = querySelector('.results-header', this.container);
    const resultsCount = querySelector('#results-count', this.container);
    
    resultsCount.textContent = this.generateSearchResultMessage();
    
    resultsHeader.classList.remove('hidden');

    // Render stations
    const stationsList = querySelector('#stations-list', this.container);
    stationsList.innerHTML = '';

    this.currentResults.forEach(station => {
      const stationCard = this.createStationCard(station);
      stationsList.appendChild(stationCard);
    });

    // Update library states for all newly rendered cards
    this.updateStationLibraryStates();

    // Show/hide load more button
    if (this.hasMore) {
      this.loadMoreButton.classList.remove('hidden');
    } else {
      this.loadMoreButton.classList.add('hidden');
    }
  }

  /**
   * Render additional search results (for load more functionality)
   */
  private renderMoreResults(newStations: RadioStation[]): void {
    // Update results count with smart messaging
    const resultsHeader = querySelector('.results-header', this.container);
    const resultsCount = querySelector('#results-count', this.container);
    
    resultsCount.textContent = this.generateSearchResultMessage();
    resultsHeader.classList.remove('hidden');

    // Append new stations to existing list
    const stationsList = querySelector('#stations-list', this.container);
    
    newStations.forEach(station => {
      // Initialize validation state for new stations
      if (!this.stationValidationStates.has(station.stationuuid)) {
        this.stationValidationStates.set(station.stationuuid, StationValidationStatus.UNKNOWN);
      }
      
      const stationCard = this.createStationCard(station);
      stationsList.appendChild(stationCard);
    });

    // Update library states for newly added cards only
    this.updateStationLibraryStatesForStations(newStations);

    // Show/hide load more button
    if (this.hasMore) {
      this.loadMoreButton.classList.remove('hidden');
    } else {
      this.loadMoreButton.classList.add('hidden');
    }
  }

  /**
   * Create a station card element
   */
  private createStationCard(station: RadioStation): HTMLElement {
    const card = createElement('div', {
      className: 'station-card'
    });
    card.dataset.stationId = station.stationuuid;

    const favicon = station.favicon ? 
      `<img src="${station.favicon}" alt="" class="station-favicon" onerror="this.style.display='none'">` : 
      '<div class="station-favicon-placeholder">📻</div>';

    const country = station.country ? 
      `<span class="station-country">${getCountryIcon()}${station.countrycode || station.country}</span>` : '';
    const bitrate = station.bitrate ? 
      `<span class="station-bitrate">${getBitrateIcon()}${station.bitrate}kbps</span>` : '';
    const votes = station.votes ? 
      `<span class="station-votes">${getVotesIcon()}${station.votes}</span>` : '';

    const isInLibrary = this.libraryStations.has(station.stationuuid);
    const addButtonIcon = isInLibrary ? 'check' : 'playlist_add';
    const addButtonTitle = isInLibrary ? 'Remove from library' : 'Add to library';
    const addButtonClass = isInLibrary ? 'add-button added' : 'add-button';

    // Get validation status for this station
    const validationStatus = this.stationValidationStates.get(station.stationuuid) || StationValidationStatus.UNKNOWN;
    
    // Generate the appropriate validation indicator content
    let validationIndicatorContent = '<div class="validation-unknown"></div>';
    let validationTitle = 'Stream not yet validated';
    
    switch (validationStatus) {
      case StationValidationStatus.VALIDATING:
        validationIndicatorContent = '<div class="validation-spinner"></div>';
        validationTitle = 'Validating stream...';
        break;
      case StationValidationStatus.VALID:
        validationIndicatorContent = '<span class="material-symbols-rounded">check_circle</span>';
        validationTitle = 'Stream verified';
        break;
      case StationValidationStatus.INVALID:
        validationIndicatorContent = '<span class="material-symbols-rounded">error</span>';
        validationTitle = 'There was an error connecting to this station.';
        break;
      default:
        // UNKNOWN - use defaults above
        break;
    }
    
    card.innerHTML = `
      <div class="station-info">
        ${favicon}
        <div class="station-details">
          <h3 class="station-name">
            ${station.name}
          </h3>
          <div class="station-metadata">
            ${country}
            ${bitrate}
            ${votes}
          </div>
          ${station.description ? `<div class="station-description">${station.description}</div>` : ''}
        </div>
      </div>
      <div class="station-actions">
          <div class="station-validation-indicator ${validationStatus}" title="${validationTitle}">${validationIndicatorContent}
          </div>
        <button type="button" class="preview-button ${validationStatus === StationValidationStatus.INVALID ? 'hidden' : ''}" data-action="preview" title="Preview station">
          <span class="material-symbols-rounded">play_arrow</span>
        </button>
        <button type="button" class="${addButtonClass} ${validationStatus === StationValidationStatus.INVALID ? 'hidden' : ''}" data-action="add" title="${addButtonTitle}">
          <span class="material-symbols-rounded">${addButtonIcon}</span>
        </button>
      </div>
    `;

    // Add event listeners
    const previewButton = querySelector('.preview-button', card);
    const addButton = querySelector('.add-button', card);

    previewButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handlePreviewClick(station);
    });

    addButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleAddStation(station);
    });

    return card;
  }

  /**
   * Handle preview button click
   */
  private handlePreviewClick(station: RadioStation): void {
    if (this.previewingStation?.stationuuid === station.stationuuid) {
      eventManager.emit('search:stop-preview');
    } else {
      eventManager.emit('search:preview', station);
    }
  }

  /**
   * Handle add/remove station button click
   */
  private handleAddStation(station: RadioStation): void {
    if (this.libraryStations.has(station.stationuuid)) {
      // Station is in library - remove it
      // First, we need to find the station ID in the library to remove it
      this.removeStationFromLibrary(station);
    } else {
      // Station is not in library - add it
      eventManager.emit('station:add', station);
    }
  }

  /**
   * Remove station from library
   */
  private removeStationFromLibrary(station: RadioStation): void {
    // Request removal by station UUID
    eventManager.emit('station:remove-by-uuid', station.stationuuid);
    eventManager.emit('notification:show', {
      type: 'success',
      message: `Removed "${station.name}" from your library`
    });
  }


  /**
   * Update station preview states
   */
  private updateStationPreviewStates(): void {
    const stationCards = this.container.querySelectorAll('.station-card');
    stationCards.forEach(card => {
      const stationId = (card as HTMLElement).dataset.stationId;
      const previewButton = card.querySelector('.preview-button') as HTMLButtonElement;
      
      if (this.loadingPreviewStation?.stationuuid === stationId) {
        previewButton.classList.remove('previewing');
        previewButton.classList.add('loading');
        previewButton.innerHTML = '<div class="loading-spinner"></div>';
        previewButton.title = 'Loading preview...';
        previewButton.disabled = true;
      } else if (this.previewingStation?.stationuuid === stationId) {
        previewButton.classList.remove('loading');
        previewButton.classList.add('previewing');
        previewButton.innerHTML = '<span class="material-symbols-rounded">pause</span>';
        previewButton.title = 'Stop preview';
        previewButton.disabled = false;
      } else {
        previewButton.classList.remove('previewing', 'loading');
        previewButton.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
        previewButton.title = 'Preview station';
        previewButton.disabled = false;
      }
    });
  }

  /**
   * Update station states based on current player
   */
  private updateStationStates(): void {
    // This would update play buttons based on currently playing station
    // Implementation depends on player state access
  }

  /**
   * Update station library states (add button icons)
   */
  private updateStationLibraryStates(): void {
    const stationCards = this.container.querySelectorAll('.station-card');
    
    stationCards.forEach(card => {
      const stationId = (card as HTMLElement).dataset.stationId;
      const addButton = card.querySelector('.add-button') as HTMLButtonElement;
      const addButtonIcon = addButton.querySelector('.material-symbols-rounded') as HTMLElement;
      
      if (stationId && this.libraryStations.has(stationId)) {
        addButton.classList.add('added');
        addButton.title = 'Remove from library';
        addButtonIcon.textContent = 'check';
      } else {
        addButton.classList.remove('added');
        addButton.title = 'Add to library';
        addButtonIcon.textContent = 'playlist_add';
      }
    });
  }

  /**
   * Update station library states for specific stations only
   */
  private updateStationLibraryStatesForStations(stations: RadioStation[]): void {
    stations.forEach(station => {
      const stationCard = this.container.querySelector(`[data-station-id="${station.stationuuid}"]`);
      if (!stationCard) return;

      const addButton = stationCard.querySelector('.add-button') as HTMLButtonElement;
      const addButtonIcon = addButton.querySelector('.material-symbols-rounded') as HTMLElement;
      
      if (this.libraryStations.has(station.stationuuid)) {
        addButton.classList.add('added');
        addButton.title = 'Remove from library';
        addButtonIcon.textContent = 'check';
      } else {
        addButton.classList.remove('added');
        addButton.title = 'Add to library';
        addButtonIcon.textContent = 'playlist_add';
      }
    });
  }

  /**
   * Create a starter pack card element
   */
  private createStarterPackCard(pack: StarterPack): HTMLElement {
    const card = createElement('div', {
      className: 'starter-pack-card'
    });

    // Generate pack name from filename (remove .json and format)
    const packName = pack.filename.replace('.json', '').split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');

    // Starter pack image
    const image = createElement('img', {
      src: pack.data.thumbnail_path || `./starter-packs/${pack.filename.replace('.json', '-thumb.png')}`,
      alt: `${packName} Starter Pack`,
      className: 'starter-pack-image'
    });

    // Handle image load error
    image.addEventListener('error', () => {
      image.style.display = 'none';
      // Create a fallback placeholder
      const placeholder = createElement('div', {
        className: 'starter-pack-image-placeholder',
        textContent: '📻'
      });
      card.insertBefore(placeholder, card.firstChild);
    });

    // Starter pack content
    const content = createElement('div', { className: 'starter-pack-card-content' }, [
      createElement('p', { textContent: pack.data.description || 'Curated collection of radio stations' }),
      createElement('div', { className: 'starter-pack-meta' }, [
        createElement('span', { textContent: `${pack.data.stations?.length || 0} stations` })
      ]),
      createElement('button', {
        className: 'add-starter-pack-btn'}, [
          createElement('span', { className: 'material-symbols-rounded' }, ['add'])
        ])
    ]);

    card.appendChild(image);
    card.appendChild(content);

    // Add event listener for the add button
    const addBtn = content.querySelector('.add-starter-pack-btn') as HTMLButtonElement;
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.addStarterPack(pack);
    });

    return card;
  }

  /**
   * Add a starter pack to the user's collection
   */
  private async addStarterPack(pack: StarterPack): Promise<void> {
    try {
      if (!pack.data.stations || !Array.isArray(pack.data.stations)) {
        eventManager.emit('notification:show', {
          type: 'error',
          message: 'Invalid starter pack format.',
        });
        return;
      }

      // Convert RadioStation format to LocalStation format for import
      const localStations: LocalStation[] = pack.data.stations.map((station) => ({
        ...station,
        id: station.stationuuid, // Use UUID as temporary ID - StationManager will generate proper ID
        dateAdded: new Date().toISOString(),
        playCount: 0,
        isFavorite: false
      }));

      // Use the stations import event to batch add all stations with merge mode
      eventManager.emit('stations:import-merge', localStations);

      // Switch library sorting to show newest stations first
      eventManager.emit('library:sort-change', 'date-added-newest');

      // Show enhanced success notification with action button
      eventManager.emit('notification:show', {
        type: 'success',
        message: `Starter pack added! ${localStations.length} stations imported.`,
        action: {
          label: 'View in Library',
          callback: () => {
            eventManager.emit('view:library');
          }
        }
      });

      // Track achievement for adding starter pack
      eventManager.emit('achievement:unlock', 'first_starter_pack');

    } catch (error) {
      console.error('Error loading starter pack:', error);
      eventManager.emit('notification:show', {
        type: 'error',
        message: 'Failed to load starter pack.',
      });
    }
  }

  /**
   * Save search sort preferences to localStorage
   */
  private saveSearchSortPreferences(): void {
    const preferences: SearchSortPreference = {
      order: this.currentFilters.order || 'votes'
    };
    
    setStorageItem(StorageKeys.SEARCH_SORT_PREFERENCE, preferences);
  }

  /**
   * Restore search sort preferences from localStorage
   */
  private restoreSearchSortPreferences(): void {
    const preferences = getStorageItem<SearchSortPreference>(
      StorageKeys.SEARCH_SORT_PREFERENCE,
      { order: 'votes' }
    );

    // Apply restored preferences
    const sortFilter = querySelector('#sort-filter', this.container) as HTMLSelectElement;
    sortFilter.value = preferences.order;

    // Update filters without triggering search (since no search is active yet)
    this.currentFilters.order = preferences.order as any;
    this.currentFilters.reverse = true; // All remaining sort options use descending order
  }

  /**
   * Show the view
   * Note: Visibility is controlled by CSS body classes (body.view-search)
   */
  show(): void {
    // Visibility is handled by CSS body classes - no action needed
  }

  /**
   * Hide the view
   * Note: Visibility is controlled by CSS body classes
   */
  hide(): void {
    // Visibility is handled by CSS body classes - no action needed
  }

  /**
   * Get the container element
   */
  getContainer(): HTMLElement {
    return this.container;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Clean up placeholder manager
    if (this.placeholderManager) {
      this.placeholderManager.destroy();
    }

    // Remove event listeners
    eventManager.off('search:started', this.handleSearchStarted.bind(this));
    eventManager.off('search:completed', this.handleSearchCompleted.bind(this));
    eventManager.off('search:more-loaded', this.handleMoreLoaded.bind(this));
    eventManager.off('search:error', this.handleSearchError.bind(this));
    eventManager.off('search:cleared', this.handleSearchCleared.bind(this));
    eventManager.off('search:preview-state', this.handlePreviewState.bind(this));
    eventManager.off('player:state-changed', this.handlePlayerStateChanged.bind(this));
    eventManager.off('station:added', this.handleStationAdded.bind(this));
    eventManager.off('station:removed', this.handleStationRemoved.bind(this));
    eventManager.off('stations:loaded', this.handleStationsLoaded.bind(this));

    this.container.remove();
  }
}