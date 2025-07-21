/**
 * SearchManager - Handles radio station search and discovery
 */

import { RadioStation, SearchParams } from '@/types/station';
import { radioBrowserApi, expandSearchTerms } from '@/services/api/radioBrowserApi';
import { mcpRadioBrowserApi } from '@/services/api/mcpRadioBrowserApi';
import { eventManager } from '@/utils/events';

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
  order?: 'name' | 'votes' | 'clickcount' | 'bitrate';
  reverse?: boolean;
}

export interface SearchManagerConfig {
  debounceMs?: number;
  pageSize?: number;
  maxResults?: number;
  enableMcpSearch?: boolean;
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
  private lastSearchTime = 0;
  private previewAudio: HTMLAudioElement | null = null;
  private currentPreviewStation: RadioStation | null = null;
  private isIntentionalStop = false;

  private readonly debounceMs: number;
  private readonly pageSize: number;
  private readonly maxResults: number;
  private readonly enableMcpSearch: boolean;

  constructor(config: SearchManagerConfig = {}) {
    this.debounceMs = config.debounceMs ?? 500;
    this.pageSize = config.pageSize ?? 20;
    this.maxResults = config.maxResults ?? 200;
    this.enableMcpSearch = config.enableMcpSearch ?? true;

    this.setupEventListeners();
    this.createPreviewAudio();
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    eventManager.on('search:execute', this.handleSearchExecute.bind(this));
    eventManager.on('search:filter', this.handleFilterChange.bind(this));
    eventManager.on('search:load-more', this.handleLoadMore.bind(this));
    eventManager.on('search:clear', this.handleClearSearch.bind(this));
    eventManager.on('search:preview', this.handlePreviewStation.bind(this));
    eventManager.on('search:stop-preview', this.handleStopPreview.bind(this));
    eventManager.on('search:get-countries', this.handleGetCountries.bind(this));
    eventManager.on('search:get-genres', this.handleGetGenres.bind(this));
    
    // Stop preview when main player starts playing
    eventManager.on('station:play', this.handleMainPlayerStarted.bind(this));
    eventManager.on('station:selected', this.handleMainPlayerStarted.bind(this));
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

    // Store search parameters
    this.currentQuery = query.trim();
    this.currentFilters = { ...filters };
    this.currentOffset = 0;

    // Emit search started event immediately for UI feedback
    eventManager.emit('search:started', { query: this.currentQuery, filters: this.currentFilters });

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
    this.lastSearchTime = Date.now();

    try {
      let result;
      let stations: RadioStation[] = [];

      // Determine search strategy based on query and filters
      const hasTextQuery = this.currentQuery.trim().length > 0;
      const hasFilters = this.hasActiveFilters(this.currentFilters);
      const shouldUseMcp = this.enableMcpSearch && hasTextQuery && !loadMore && this.currentOffset === 0;

      if (shouldUseMcp && !hasFilters) {
        // Use MCP for natural language search when we have text query and no filters
        console.log('[SearchManager] Using MCP natural language search');
        result = await mcpRadioBrowserApi.searchStationsNatural(this.currentQuery, this.pageSize);
        
        if (result.success) {
          stations = result.data || [];
        } else {
          // Fallback to regular API if MCP fails
          console.log('[SearchManager] MCP search failed, falling back to regular API');
          result = await this.performRegularSearch();
          stations = result.data || [];
        }
      } else {
        // Use regular API for structured searches, filters, or pagination
        result = await this.performRegularSearch();
        stations = result.data || [];
      }

      if (!result.success) {
        throw new Error(result.error || 'Search failed');
      }

      const hasMore = stations.length === this.pageSize && this.currentOffset + stations.length < this.maxResults;

      const searchResult: SearchResult = {
        stations,
        total: stations.length + this.currentOffset,
        hasMore,
        query: this.currentQuery,
        filters: this.currentFilters
      };

      eventManager.emit(loadMore ? 'search:more-loaded' : 'search:completed', searchResult);

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

    // Add name parameter only if we have a text query
    if (this.currentQuery) {
      const expandedTerms = expandSearchTerms(this.currentQuery);
      const primaryTerm = expandedTerms[0];
      searchParams.name = primaryTerm;
    }

    // Map genre filter to tag parameter for API
    if (this.currentFilters.genre) {
      searchParams.tag = this.currentFilters.genre;
    }

    // Map minBitrate to bitrate parameter for API
    if (this.currentFilters.minBitrate) {
      searchParams.bitrate = this.currentFilters.minBitrate;
    }

    // Remove undefined values
    Object.keys(searchParams).forEach(key => {
      if (searchParams[key as keyof SearchParams] === undefined) {
        delete searchParams[key as keyof SearchParams];
      }
    });

    return radioBrowserApi.searchStations(searchParams);
  }

  /**
   * Get popular stations
   */
  async getPopularStations(limit = 20): Promise<RadioStation[]> {
    try {
      const result = await radioBrowserApi.getPopularStations(limit);
      return result.success ? result.data || [] : [];
    } catch (error) {
      console.error('[SearchManager] Popular stations error:', error);
      return [];
    }
  }

  /**
   * Get stations by genre
   */
  async getStationsByGenre(genre: string, limit = 20): Promise<RadioStation[]> {
    try {
      const result = await radioBrowserApi.getStationsByTag(genre, limit);
      return result.success ? result.data || [] : [];
    } catch (error) {
      console.error('[SearchManager] Genre stations error:', error);
      return [];
    }
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
    return !!(
      filters.country ||
      filters.genre ||
      filters.language ||
      filters.minBitrate
    );
  }

  /**
   * Get available countries for filtering
   */
  async getAvailableCountries(): Promise<Array<{ name: string; stationcount: number }>> {
    try {
      const result = await radioBrowserApi.getCountries();
      return result.success ? result.data || [] : [];
    } catch (error) {
      console.error('[SearchManager] Countries error:', error);
      return [];
    }
  }

  /**
   * Get available genres for filtering
   */
  async getAvailableGenres(): Promise<Array<{ name: string; stationcount: number }>> {
    try {
      const result = await radioBrowserApi.getTags();
      return result.success ? result.data || [] : [];
    } catch (error) {
      console.error('[SearchManager] Genres error:', error);
      return [];
    }
  }

  /**
   * Get available languages for filtering
   */
  async getAvailableLanguages(): Promise<Array<{ name: string; stationcount: number }>> {
    try {
      const result = await radioBrowserApi.getLanguages();
      return result.success ? result.data || [] : [];
    } catch (error) {
      console.error('[SearchManager] Languages error:', error);
      return [];
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    this.stopPreview();

    if (this.previewAudio) {
      this.previewAudio.remove();
      this.previewAudio = null;
    }

    // Remove event listeners
    eventManager.off('search:execute', this.handleSearchExecute.bind(this));
    eventManager.off('search:filter', this.handleFilterChange.bind(this));
    eventManager.off('search:load-more', this.handleLoadMore.bind(this));
    eventManager.off('search:clear', this.handleClearSearch.bind(this));
    eventManager.off('search:preview', this.handlePreviewStation.bind(this));
    eventManager.off('search:stop-preview', this.handleStopPreview.bind(this));
    eventManager.off('station:play', this.handleMainPlayerStarted.bind(this));
    eventManager.off('station:selected', this.handleMainPlayerStarted.bind(this));
  }
}