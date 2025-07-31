/**
 * SearchManager - Handles radio station search and discovery
 */

import { RadioStation, SearchParams } from '@/types/station';
import { radioBrowserApi, expandSearchTerms, GENRE_MAPPING } from '@/services/api/radioBrowserApi';
import { mcpRadioBrowserApi } from '@/services/api/mcpRadioBrowserApi';
import { eventManager } from '@/utils/events';
import { streamValidator } from '@/services/validation/streamValidator';
import { ValidationProgress, StationValidationState, StationValidationStatus } from '@/types/validation';

export interface SearchResult {
  stations: RadioStation[];
  total: number;
  hasMore: boolean;
  query: string;
  filters: SearchFilters;
}

export interface SearchFilters {
  country?: string;
  genre?: string;
  language?: string;
  minBitrate?: number;
  order?: 'name' | 'votes' | 'clickcount' | 'clicktrend' | 'bitrate' | 'lastcheckok' | 'country' | 'random';
  reverse?: boolean;
}

export interface SearchManagerConfig {
  debounceMs?: number;
  pageSize?: number;
  maxResults?: number;
  enableMcpSearch?: boolean;
  enableValidation?: boolean;
}

/**
 * SearchManager handles radio station search and discovery functionality
 */
export class SearchManager {
  private searchTimeout: number | null = null;
  private currentQuery = '';
  private currentFilters: SearchFilters = {};
  private currentOffset = 0;
  private isSearching = false;
  private previewAudio: HTMLAudioElement | null = null;
  private currentPreviewStation: RadioStation | null = null;
  private isIntentionalStop = false;

  private readonly debounceMs: number;
  private readonly pageSize: number;
  private readonly maxResults: number;
  private readonly enableMcpSearch: boolean;
  private readonly enableValidation: boolean;

  // Store bound event handlers for proper cleanup
  private readonly boundHandlers = {
    searchExecute: this.handleSearchExecute.bind(this),
    filterChange: this.handleFilterChange.bind(this),
    loadMore: this.handleLoadMore.bind(this),
    clearSearch: this.handleClearSearch.bind(this),
    previewStation: this.handlePreviewStation.bind(this),
    stopPreview: this.handleStopPreview.bind(this),
    getCountries: this.handleGetCountries.bind(this),
    getGenres: this.handleGetGenres.bind(this),
    mainPlayerStarted: this.handleMainPlayerStarted.bind(this)
  };

  constructor(config: SearchManagerConfig = {}) {
    this.debounceMs = config.debounceMs ?? 500;
    this.pageSize = config.pageSize ?? 20;
    this.maxResults = config.maxResults ?? 200;
    this.enableMcpSearch = config.enableMcpSearch ?? true;
    this.enableValidation = config.enableValidation ?? true;

    this.setupEventListeners();
    this.createPreviewAudio();
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    eventManager.on('search:execute', this.boundHandlers.searchExecute);
    eventManager.on('search:filter', this.boundHandlers.filterChange);
    eventManager.on('search:load-more', this.boundHandlers.loadMore);
    eventManager.on('search:clear', this.boundHandlers.clearSearch);
    eventManager.on('search:preview', this.boundHandlers.previewStation);
    eventManager.on('search:stop-preview', this.boundHandlers.stopPreview);
    eventManager.on('search:get-countries', this.boundHandlers.getCountries);
    eventManager.on('search:get-genres', this.boundHandlers.getGenres);
    
    // Stop preview when main player starts playing
    eventManager.on('station:play', this.boundHandlers.mainPlayerStarted);
  }

  /**
   * Create preview audio element
   */
  private createPreviewAudio(): void {
    this.previewAudio = new Audio();
    this.previewAudio.volume = 0.5; // Lower volume for previews
    this.previewAudio.preload = 'none';
    
    this.previewAudio.addEventListener('loadstart', () => {
      eventManager.emit('search:preview-state', { state: 'loading', station: this.currentPreviewStation });
    });

    this.previewAudio.addEventListener('canplay', () => {
      eventManager.emit('search:preview-state', { state: 'ready', station: this.currentPreviewStation });
    });

    this.previewAudio.addEventListener('playing', () => {
      eventManager.emit('search:preview-state', { state: 'playing', station: this.currentPreviewStation });
    });

    this.previewAudio.addEventListener('pause', () => {
      eventManager.emit('search:preview-state', { state: 'paused', station: this.currentPreviewStation });
    });

    this.previewAudio.addEventListener('error', (error) => {
      // Don't show error toast for intentional stops (setting src to empty)
      if (this.isIntentionalStop) {
        this.isIntentionalStop = false;
        return;
      }
      
      console.error('[SearchManager] Preview error:', error);
      eventManager.emit('search:preview-state', { state: 'error', station: this.currentPreviewStation });
      eventManager.emit('notification:show', {
        type: 'error',
        message: 'Preview not available for this station'
      });
    });
  }

  /**
   * Execute search with debouncing
   */
  private handleSearchExecute(data: { query: string; filters?: SearchFilters }): void {
    const { query, filters = {} } = data;

    // Clear existing timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Cancel any ongoing validation
    streamValidator.cancelValidation();

    // Store search parameters
    this.currentQuery = query.trim();
    this.currentFilters = { ...filters };
    this.currentOffset = 0;

    // Emit search started event immediately for UI feedback
    eventManager.emit('search:started', { 
      query: this.currentQuery, 
      filters: this.currentFilters,
      isLoadMore: this.currentOffset > 0 // Indicate if this is a load more operation
    });

    // Check if we have any search criteria (either query text or filters)
    const hasSearchCriteria = this.currentQuery || this.hasActiveFilters(this.currentFilters);
    
    if (!hasSearchCriteria) {
      // No search criteria - emit empty results
      eventManager.emit('search:completed', {
        stations: [],
        total: 0,
        hasMore: false,
        query: this.currentQuery,
        filters: this.currentFilters
      });
      return;
    }

    // Debounce the actual search
    this.searchTimeout = window.setTimeout(() => {
      this.performSearch();
    }, this.debounceMs);
  }

  /**
   * Handle filter changes
   */
  private handleFilterChange(filters: SearchFilters): void {
    this.currentFilters = { ...this.currentFilters, ...filters };
    this.currentOffset = 0;

    // Always trigger search when filters change, regardless of whether there's a text query
    this.handleSearchExecute({ query: this.currentQuery, filters: this.currentFilters });
  }

  /**
   * Handle load more results
   */
  private handleLoadMore(): void {
    if (this.isSearching || !this.currentQuery) {
      return;
    }

    this.currentOffset += this.pageSize;
    this.performSearch(true);
  }

  /**
   * Handle clear search
   */
  private handleClearSearch(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    this.currentQuery = '';
    this.currentFilters = {};
    this.currentOffset = 0;
    this.isSearching = false;

    this.stopPreview();

    eventManager.emit('search:cleared');
  }

  /**
   * Handle station preview
   */
  private handlePreviewStation(station: RadioStation): void {
    if (!this.previewAudio) return;

    // Stop current preview if playing different station
    if (this.currentPreviewStation?.stationuuid !== station.stationuuid) {
      this.stopPreview();
    }

    // Pause main player before starting preview to avoid overlapping audio
    eventManager.emit('station:pause');

    this.currentPreviewStation = station;

    try {
      const streamUrl = station.url_resolved || station.url;
      this.previewAudio.src = streamUrl;
      this.previewAudio.play();
    } catch (error) {
      console.error('[SearchManager] Preview start error:', error);
      eventManager.emit('search:preview-state', { state: 'error', station });
    }
  }

  /**
   * Handle stop preview
   */
  private handleStopPreview(): void {
    this.stopPreview();
  }

  /**
   * Handle main player starting - stop any active preview
   */
  private handleMainPlayerStarted(): void {
    if (this.currentPreviewStation) {
      this.stopPreview();
    }
  }

  /**
   * Stop current preview
   */
  private stopPreview(): void {
    if (this.previewAudio) {
      this.previewAudio.pause();
      // Set flag before clearing src to prevent error toast
      this.isIntentionalStop = true;
      this.previewAudio.src = '';
    }
    this.currentPreviewStation = null;
    eventManager.emit('search:preview-state', { state: 'stopped', station: null });
  }

  /**
   * Perform the actual search
   */
  private async performSearch(loadMore = false): Promise<void> {
    if (this.isSearching) {
      return;
    }

    this.isSearching = true;

    try {
      let result;
      let stations: RadioStation[] = [];

      // Determine search strategy based on query and filters
      const hasTextQuery = this.currentQuery.trim().length > 0;
      const hasFilters = this.hasActiveFilters(this.currentFilters);
      const isSimpleGenreSearch = hasTextQuery && this.isSimpleGenreQuery(this.currentQuery);
      const shouldUseMcp = this.enableMcpSearch && hasTextQuery && !loadMore && this.currentOffset === 0 && !isSimpleGenreSearch;

      if (shouldUseMcp && !hasFilters) {
        // Use MCP for natural language search when we have text query and no filters
        console.log('[SearchManager] Using MCP natural language search');
        result = await mcpRadioBrowserApi.searchStationsNatural(this.currentQuery, this.pageSize);
        
        if (result.success) {
          stations = result.data || [];
          // Always apply sorting to MCP results to ensure user's sort preference is respected
          if (this.currentFilters.order) {
            stations = this.sortStations(stations, this.currentFilters.order, this.currentFilters.reverse);
            console.log(`[SearchManager] Applied secondary sorting to MCP results: ${this.currentFilters.order}`);
          }
        } else {
          // Fallback to regular API if MCP fails
          console.log('[SearchManager] MCP search failed, falling back to regular API');
          result = await this.performRegularSearch();
          stations = result.data || [];
        }
      } else {
        // Use regular API for structured searches, filters, pagination, or simple genre queries
        console.log(`[SearchManager] Using regular API search${isSimpleGenreSearch ? ' (simple genre query)' : ''}`);
        result = await this.performRegularSearch();
        stations = result.data || [];
      }

      if (!result.success) {
        throw new Error(result.error || 'Search failed');
      }

      // Validate streams if validation is enabled and we have stations
      if (this.enableValidation && stations.length > 0) {
        await this.validateAndEmitResults(stations, loadMore);
      } else {
        // No validation - emit results immediately
        const hasMore = stations.length === this.pageSize && this.currentOffset + stations.length < this.maxResults;

        const searchResult: SearchResult = {
          stations,
          total: stations.length + this.currentOffset,
          hasMore,
          query: this.currentQuery,
          filters: this.currentFilters
        };

        eventManager.emit(loadMore ? 'search:more-loaded' : 'search:completed', searchResult);
      }

    } catch (error) {
      console.error('[SearchManager] Search error:', error);
      eventManager.emit('search:error', {
        message: error instanceof Error ? error.message : 'Search failed',
        query: this.currentQuery,
        filters: this.currentFilters
      });
      eventManager.emit('notification:show', {
        type: 'error',
        message: 'Search temporarily unavailable. Please try again.'
      });
    } finally {
      this.isSearching = false;
    }
  }

  /**
   * Show immediate results and validate stations in background
   */
  private async validateAndEmitResults(stations: RadioStation[], loadMore: boolean): Promise<void> {
    // PHASE 1: Show immediate results without validation
    const hasMore = stations.length === this.pageSize && 
                   this.currentOffset + stations.length < this.maxResults;

    const immediateResult: SearchResult = {
      stations,
      total: stations.length + this.currentOffset,
      hasMore,
      query: this.currentQuery,
      filters: this.currentFilters
    };

    // Emit immediate results - users see these instantly
    eventManager.emit('search:immediate-results', immediateResult);
    eventManager.emit(loadMore ? 'search:more-loaded' : 'search:completed', immediateResult);

    // PHASE 2: Start background validation
    this.validateStationsInBackground(stations, loadMore);
  }

  /**
   * Validate stations in background and emit individual station updates
   */
  private async validateStationsInBackground(stations: RadioStation[], loadMore = false): Promise<void> {
    // Emit validation started event
    eventManager.emit('search:validating', {
      total: stations.length,
      query: this.currentQuery,
      filters: this.currentFilters,
      loadMore: loadMore, // Tell the UI this is a load more operation
      stationsToValidate: stations.map(s => s.stationuuid) // Only these stations should be marked as validating
    });

    try {
      // Use streaming validation to get individual station results
      const validationResult = await streamValidator.validateStationsStreaming(
        stations,
        (stationState: StationValidationState) => {
          // Emit individual station validation updates
          if (stationState.status === StationValidationStatus.VALID) {
            eventManager.emit('search:station-validated', stationState);
          } else if (stationState.status === StationValidationStatus.INVALID) {
            eventManager.emit('search:station-validation-failed', stationState);
          }
          // Note: VALIDATING status is handled internally by the UI
        },
        (progress: ValidationProgress) => {
          // Emit progress updates
          eventManager.emit('search:validation-progress', progress);
        }
      );

      // Emit validation complete event
      eventManager.emit('search:validation-complete', {
        validatedCount: validationResult.validStations.length,
        invalidCount: validationResult.invalidStations.length,
        totalCount: stations.length
      });


    } catch (error) {
      console.error('[SearchManager] Background validation error:', error);
      
      // Emit validation cancelled event
      eventManager.emit('search:validation-cancelled', {
        error: error instanceof Error ? error.message : 'Validation failed'
      });

      eventManager.emit('notification:show', {
        type: 'warning',
        message: 'Stream validation failed. Results may include invalid stations.',
        duration: 3000
      });
    }
  }

  /**
   * Check if a query is a simple genre search that should use regular API instead of MCP
   */
  private isSimpleGenreQuery(query: string): boolean {
    const queryLower = query.toLowerCase().trim();
    
    // Single word genre queries
    if (!queryLower.includes(' ')) {
      // Check if it's a main genre key or one of its synonyms
      return Object.entries(GENRE_MAPPING).some(([genre, synonyms]) => {
        return queryLower === genre || synonyms.some(synonym => 
          synonym.toLowerCase() === queryLower
        );
      });
    }
    
    // Multi-word queries that are clearly genre-focused
    const genrePattern = /^(jazz|rock|pop|classical|electronic|country|blues|reggae|metal|indie|dance|hip hop|rap|smooth jazz|classic rock|hard rock|heavy metal|death metal|black metal|house music|techno music|country music|pop music)$/i;
    
    return genrePattern.test(queryLower);
  }

  /**
   * Perform regular Radio Browser API search
   */
  private async performRegularSearch() {
    // Build base search parameters
    const searchParams: SearchParams = {
      limit: this.pageSize,
      offset: this.currentOffset,
      order: this.currentFilters.order || 'votes',
      reverse: this.currentFilters.reverse !== false, // Default to true for relevance
      ...this.currentFilters
    };

    // Add name or tag parameter based on query type
    if (this.currentQuery) {
      if (this.isSimpleGenreQuery(this.currentQuery)) {
        // For simple genre queries, search by tag instead of name for better results
        searchParams.tag = this.currentQuery.toLowerCase();
        console.log(`[SearchManager] Using tag search for genre: ${this.currentQuery}`);
      } else {
        // For general text queries, search by name
        const expandedTerms = expandSearchTerms(this.currentQuery);
        const primaryTerm = expandedTerms[0];
        searchParams.name = primaryTerm;
      }
    }

    // Map genre filter to tag parameter for API (only if not already set by query)
    if (this.currentFilters.genre && !searchParams.tag) {
      searchParams.tag = this.currentFilters.genre;
    }

    // Map minBitrate to bitrate parameter for API
    if (this.currentFilters.minBitrate) {
      searchParams.bitrate = this.currentFilters.minBitrate;
    }

    return radioBrowserApi.searchStations(searchParams);
  }

  /**
   * Get popular stations
   */
  async getPopularStations(limit = 20): Promise<RadioStation[]> {
    const result = await radioBrowserApi.getPopularStations(limit);
    return result.success ? result.data || [] : [];
  }

  /**
   * Get stations by genre
   */
  async getStationsByGenre(genre: string, limit = 20): Promise<RadioStation[]> {
    const result = await radioBrowserApi.getStationsByTag(genre, limit);
    return result.success ? result.data || [] : [];
  }

  /**
   * Get current search state
   */
  getCurrentSearchState(): {
    query: string;
    filters: SearchFilters;
    isSearching: boolean;
    hasResults: boolean;
  } {
    return {
      query: this.currentQuery,
      filters: { ...this.currentFilters },
      isSearching: this.isSearching,
      hasResults: this.currentQuery.length > 0
    };
  }

  /**
   * Check if preview is playing for a station
   */
  isPreviewPlaying(station: RadioStation): boolean {
    return this.currentPreviewStation?.stationuuid === station.stationuuid &&
           this.previewAudio?.paused === false;
  }

  /**
   * Handle get countries event
   */
  private async handleGetCountries(): Promise<void> {
    const countries = await this.getAvailableCountries();
    eventManager.emit('search:countries-response', countries);
  }

  /**
   * Handle get genres event
   */
  private async handleGetGenres(): Promise<void> {
    const genres = await this.getAvailableGenres();
    eventManager.emit('search:genres-response', genres);
  }

  /**
   * Check if any filters are active (have non-empty values)
   */
  private hasActiveFilters(filters: SearchFilters): boolean {
    return !!(filters.country || filters.genre || filters.language || filters.minBitrate);
  }

  /**
   * Get available countries for filtering
   */
  async getAvailableCountries(): Promise<Array<{ name: string; stationcount: number }>> {
    const result = await radioBrowserApi.getCountries();
    return result.success ? result.data || [] : [];
  }

  /**
   * Get available genres for filtering
   */
  async getAvailableGenres(): Promise<Array<{ name: string; stationcount: number }>> {
    const result = await radioBrowserApi.getTags();
    return result.success ? result.data || [] : [];
  }

  /**
   * Get available languages for filtering
   */
  async getAvailableLanguages(): Promise<Array<{ name: string; stationcount: number }>> {
    const result = await radioBrowserApi.getLanguages();
    return result.success ? result.data || [] : [];
  }


  /**
   * Get current preview state
   */
  getCurrentPreviewState(): { station: RadioStation | null; isPlaying: boolean } {
    return {
      station: this.currentPreviewStation,
      isPlaying: this.currentPreviewStation !== null && this.previewAudio !== null && !this.previewAudio.paused
    };
  }

  /**
   * Sort stations array by specified criteria
   * 
   * TODO: Future enhancements for multi-level sorting:
   * - Sort by primary criteria, then by secondary (e.g., "Popularity within Country")
   * - Combined quality metrics (bitrate + codec score)
   * - Reliability scoring (uptime + successful checks)
   * - User preference learning (boost stations user previously liked)
   */
  private sortStations(stations: RadioStation[], order: string, reverse = true): RadioStation[] {
    const sortedStations = [...stations];
    
    sortedStations.sort((a, b) => {
      let comparison = 0;
      
      switch (order) {
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'votes':
          comparison = (a.votes || 0) - (b.votes || 0);
          break;
        case 'clickcount':
          comparison = (a.clickcount || 0) - (b.clickcount || 0);
          break;
        case 'clicktrend':
          comparison = (a.clicktrend || 0) - (b.clicktrend || 0);
          break;
        case 'bitrate':
          comparison = (a.bitrate || 0) - (b.bitrate || 0);
          break;
        case 'lastcheckok':
          // Convert lastcheckoktime to timestamp for comparison
          const aTime = a.lastcheckoktime_iso8601 ? new Date(a.lastcheckoktime_iso8601).getTime() : 0;
          const bTime = b.lastcheckoktime_iso8601 ? new Date(b.lastcheckoktime_iso8601).getTime() : 0;
          comparison = aTime - bTime;
          break;
        case 'country':
          comparison = (a.country || '').localeCompare(b.country || '');
          break;
        case 'random':
          comparison = Math.random() - 0.5;
          break;
        default:
          comparison = 0; // No sorting for unknown order
          break;
      }
      
      return reverse ? -comparison : comparison;
    });
    
    return sortedStations;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Cancel any ongoing validation
    streamValidator.cancelValidation();

    this.stopPreview();

    if (this.previewAudio) {
      this.previewAudio.remove();
      this.previewAudio = null;
    }

    // Remove event listeners
    eventManager.off('search:execute', this.boundHandlers.searchExecute);
    eventManager.off('search:filter', this.boundHandlers.filterChange);
    eventManager.off('search:load-more', this.boundHandlers.loadMore);
    eventManager.off('search:clear', this.boundHandlers.clearSearch);
    eventManager.off('search:preview', this.boundHandlers.previewStation);
    eventManager.off('search:stop-preview', this.boundHandlers.stopPreview);
    eventManager.off('search:get-countries', this.boundHandlers.getCountries);
    eventManager.off('search:get-genres', this.boundHandlers.getGenres);
    eventManager.off('station:play', this.boundHandlers.mainPlayerStarted);
  }
}