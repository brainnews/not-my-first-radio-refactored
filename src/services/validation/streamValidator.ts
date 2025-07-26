/**
 * Stream URL validation service for verifying radio station streams
 */

import { RadioStation } from '@/types/station';
import {
  ValidationResult,
  ValidationCache,
  ValidationConfig,
  ValidationError,
  ValidationErrorType,
  ValidationProgress,
  BatchValidationResult,
  StationValidationState,
  StationValidationStatus,
  DEFAULT_VALIDATION_CONFIG
} from '@/types/validation';

/**
 * Stream validator service for checking radio station accessibility and compatibility
 */
export class StreamValidator {
  private cache: ValidationCache = {};
  private config: ValidationConfig;
  private abortController: AbortController | null = null;

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config };
  }

  /**
   * Validate a single stream URL
   */
  async validateStream(url: string): Promise<ValidationResult> {
    const startTime = Date.now();

    // Check cache first
    if (this.config.enableCache) {
      const cachedResult = this.getCachedResult(url);
      if (cachedResult) {
        return { ...cachedResult, cached: true };
      }
    }

    let result: ValidationResult;

    try {
      // First check URL accessibility via GET request
      const accessibilityCheck = await this.checkUrlAccessibility(url);
      
      // If fetch fails with "Failed to fetch", try audio element test as fallback
      // This handles cases where CORS/security policies block fetch but audio elements work
      if (!accessibilityCheck.isValid && accessibilityCheck.error?.message === 'Failed to fetch') {
        console.log(`[StreamValidator] Fetch blocked for ${url}, trying audio element fallback...`);
        const audioFallbackCheck = await this.checkAudioCompatibility(url);
        
        if (audioFallbackCheck.isValid) {
          console.log(`[StreamValidator] Audio fallback succeeded for ${url}`);
          result = {
            url,
            isValid: true,
            responseTime: Date.now() - startTime,
            lastChecked: new Date()
          };
        } else {
          console.log(`[StreamValidator] Audio fallback also failed for ${url}`);
          result = {
            url,
            isValid: false,
            error: audioFallbackCheck.error,
            responseTime: Date.now() - startTime,
            lastChecked: new Date()
          };
        }
      } else if (!accessibilityCheck.isValid) {
        console.log(`[StreamValidator] URL accessibility failed:`, accessibilityCheck.error);
        result = {
          url,
          isValid: false,
          error: accessibilityCheck.error,
          responseTime: Date.now() - startTime,
          lastChecked: new Date()
        };
      } else {
        // If URL is accessible, check audio compatibility
        const compatibilityCheck = await this.checkAudioCompatibility(url);
        
        result = {
          url,
          isValid: compatibilityCheck.isValid,
          error: compatibilityCheck.error,
          responseTime: Date.now() - startTime,
          lastChecked: new Date()
        };
      }
    } catch (error) {
      result = {
        url,
        isValid: false,
        error: {
          type: ValidationErrorType.NETWORK_ERROR,
          message: error instanceof Error ? error.message : 'Unknown validation error',
          retryable: true
        },
        responseTime: Date.now() - startTime,
        lastChecked: new Date()
      };
    }

    // Cache the result
    if (this.config.enableCache) {
      this.cacheResult(result);
    }

    return result;
  }

  /**
   * Validate multiple streams with individual station callbacks
   * This enables progressive/streaming results as each station is validated
   */
  async validateStationsStreaming(
    stations: RadioStation[],
    onStationValidated: (state: StationValidationState) => void,
    onProgress?: (progress: ValidationProgress) => void
  ): Promise<BatchValidationResult> {
    const total = stations.length;
    let validated = 0;
    let failed = 0;
    let inProgress = 0;

    const validStations: string[] = [];
    const invalidStations: string[] = [];
    const pendingStations: string[] = stations.map(s => s.stationuuid);

    // Create abort controller for this batch
    this.abortController = new AbortController();

    // Update progress callback helper
    const updateProgress = () => {
      if (onProgress) {
        const currentProgress: ValidationProgress = {
          total,
          validated,
          failed,
          inProgress,
          percentComplete: Math.round(((validated + failed) / total) * 100)
        };
        onProgress(currentProgress);
      }
    };

    // Process stations in batches
    for (let i = 0; i < stations.length; i += this.config.batchSize) {
      const batch = stations.slice(i, i + this.config.batchSize);
      const batchPromises = batch.map(async (station) => {
        if (this.abortController?.signal.aborted) {
          return null;
        }

        inProgress++;
        
        // Emit validating state immediately
        onStationValidated({
          stationUuid: station.stationuuid,
          status: StationValidationStatus.VALIDATING
        });
        
        updateProgress();

        try {
          const streamUrl = station.url_resolved || station.url;
          const result = await this.validateStream(streamUrl);
          
          inProgress--;
          
          if (result.isValid) {
            validStations.push(station.stationuuid);
            validated++;
            
            // Emit valid state
            onStationValidated({
              stationUuid: station.stationuuid,
              status: StationValidationStatus.VALID,
              responseTime: result.responseTime,
              lastChecked: result.lastChecked
            });
          } else {
            invalidStations.push(station.stationuuid);
            failed++;
            
            // Emit invalid state
            onStationValidated({
              stationUuid: station.stationuuid,
              status: StationValidationStatus.INVALID,
              error: result.error,
              responseTime: result.responseTime,
              lastChecked: result.lastChecked
            });
          }

          // Remove from pending
          const pendingIndex = pendingStations.indexOf(station.stationuuid);
          if (pendingIndex > -1) {
            pendingStations.splice(pendingIndex, 1);
          }

          updateProgress();
          return result;
        } catch (error) {
          inProgress--;
          failed++;
          invalidStations.push(station.stationuuid);
          
          // Emit invalid state with error
          onStationValidated({
            stationUuid: station.stationuuid,
            status: StationValidationStatus.INVALID,
            error: {
              type: ValidationErrorType.NETWORK_ERROR,
              message: error instanceof Error ? error.message : 'Unknown validation error',
              retryable: true
            },
            lastChecked: new Date()
          });
          
          // Remove from pending  
          const pendingIndex = pendingStations.indexOf(station.stationuuid);
          if (pendingIndex > -1) {
            pendingStations.splice(pendingIndex, 1);
          }

          updateProgress();
          return null;
        }
      });

      // Wait for batch to complete
      await Promise.allSettled(batchPromises);

      // Check if aborted
      if (this.abortController?.signal.aborted) {
        break;
      }
    }

    const progress: ValidationProgress = {
      total,
      validated,
      failed,
      inProgress,
      percentComplete: Math.round(((validated + failed) / total) * 100)
    };

    // Call final progress update
    updateProgress();

    return {
      validStations,
      invalidStations,
      pendingStations,
      progress,
      completed: !this.abortController?.signal.aborted
    };
  }

  /**
   * Validate multiple streams in batches with progress tracking (legacy method)
   */
  async validateBatch(
    stations: RadioStation[],
    onProgress?: (progress: ValidationProgress) => void
  ): Promise<BatchValidationResult> {
    const total = stations.length;
    let validated = 0;
    let failed = 0;
    let inProgress = 0;

    const validStations: string[] = [];
    const invalidStations: string[] = [];
    const pendingStations: string[] = stations.map(s => s.stationuuid);

    // Create abort controller for this batch
    this.abortController = new AbortController();

    // Update progress callback helper
    const updateProgress = () => {
      if (onProgress) {
        const currentProgress: ValidationProgress = {
          total,
          validated,
          failed,
          inProgress,
          percentComplete: Math.round(((validated + failed) / total) * 100)
        };
        onProgress(currentProgress);
      }
    };

    // Process stations in batches
    for (let i = 0; i < stations.length; i += this.config.batchSize) {
      const batch = stations.slice(i, i + this.config.batchSize);
      const batchPromises = batch.map(async (station) => {
        if (this.abortController?.signal.aborted) {
          return null;
        }

        inProgress++;
        updateProgress();

        try {
          const streamUrl = station.url_resolved || station.url;
          const result = await this.validateStream(streamUrl);
          
          inProgress--;
          
          if (result.isValid) {
            validStations.push(station.stationuuid);
            validated++;
          } else {
            invalidStations.push(station.stationuuid);
            failed++;
          }

          // Remove from pending
          const pendingIndex = pendingStations.indexOf(station.stationuuid);
          if (pendingIndex > -1) {
            pendingStations.splice(pendingIndex, 1);
          }

          updateProgress();
          return result;
        } catch (error) {
          inProgress--;
          failed++;
          invalidStations.push(station.stationuuid);
          
          // Remove from pending  
          const pendingIndex = pendingStations.indexOf(station.stationuuid);
          if (pendingIndex > -1) {
            pendingStations.splice(pendingIndex, 1);
          }

          updateProgress();
          return null;
        }
      });

      // Wait for batch to complete
      await Promise.allSettled(batchPromises);

      // Check if aborted
      if (this.abortController?.signal.aborted) {
        break;
      }
    }

    const progress: ValidationProgress = {
      total,
      validated,
      failed,
      inProgress,
      percentComplete: Math.round(((validated + failed) / total) * 100)
    };

    // Call final progress update
    updateProgress();

    return {
      validStations,
      invalidStations,
      pendingStations,
      progress,
      completed: !this.abortController?.signal.aborted
    };
  }

  /**
   * Cancel ongoing validation
   */
  cancelValidation(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Check if a URL is accessible via lightweight GET request
   */
  private async checkUrlAccessibility(url: string): Promise<{ isValid: boolean; error?: ValidationError }> {
    // Use a shorter timeout for just checking connectivity
    const shortTimeout = Math.min(this.config.timeout, 3000);
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), shortTimeout);

      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'audio/*'
        }
      });

      clearTimeout(timeoutId);

      // Accept successful responses
      if (response.ok) {
        // Abort the response body to stop downloading stream data
        try {
          controller.abort();
        } catch (abortError) {
          // Ignore abort errors after successful response
        }
        return { isValid: true };
      }
      return {
        isValid: false,
        error: {
          type: ValidationErrorType.HTTP_ERROR,
          message: `HTTP ${response.status}: ${response.statusText}`,
          httpStatus: response.status,
          retryable: response.status >= 500 // Server errors are retryable
        }
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            isValid: false,
            error: {
              type: ValidationErrorType.TIMEOUT,
              message: `Request timed out after ${this.config.timeout}ms`,
              retryable: true
            }
          };
        }
        
        return {
          isValid: false,
          error: {
            type: ValidationErrorType.NETWORK_ERROR,
            message: error.message,
            retryable: true
          }
        };
      }
      
      return {
        isValid: false,
        error: {
          type: ValidationErrorType.NETWORK_ERROR,
          message: 'Unknown network error',
          retryable: true
        }
      };
    }
  }

  /**
   * Check if a stream is compatible with HTML5 Audio
   */
  private async checkAudioCompatibility(url: string): Promise<{ isValid: boolean; error?: ValidationError }> {
    return new Promise((resolve) => {
      const audio = new Audio();
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          audio.src = '';
          resolve({
            isValid: false,
            error: {
              type: ValidationErrorType.TIMEOUT,
              message: 'Audio compatibility check timed out',
              retryable: false
            }
          });
        }
      }, this.config.timeout);

      audio.addEventListener('canplay', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          audio.src = '';
          resolve({ isValid: true });
        }
      });

      audio.addEventListener('error', (event) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          audio.src = '';
          
          const audioElement = event.target as HTMLAudioElement;
          const error = audioElement.error;
          
          let errorMessage = 'Audio format not supported';
          if (error) {
            switch (error.code) {
              case MediaError.MEDIA_ERR_ABORTED:
                errorMessage = 'Audio loading aborted';
                break;
              case MediaError.MEDIA_ERR_NETWORK:
                errorMessage = 'Network error during audio loading';
                break;
              case MediaError.MEDIA_ERR_DECODE:
                errorMessage = 'Audio format not supported';
                break;
              case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                errorMessage = 'Audio source not supported';
                break;
            }
          }

          resolve({
            isValid: false,
            error: {
              type: ValidationErrorType.AUDIO_COMPATIBILITY,
              message: errorMessage,
              retryable: false
            }
          });
        }
      });

      // Set audio source to start loading
      audio.preload = 'metadata';
      audio.src = url;
    });
  }

  /**
   * Get cached validation result if available and not expired
   */
  private getCachedResult(url: string): ValidationResult | null {
    const cacheEntry = this.cache[url];
    if (!cacheEntry) {
      return null;
    }

    // Check if cache entry is expired
    if (Date.now() > cacheEntry.expiresAt.getTime()) {
      delete this.cache[url];
      return null;
    }

    return cacheEntry.result;
  }

  /**
   * Cache a validation result
   */
  private cacheResult(result: ValidationResult): void {
    // Use shorter cache time for failed validations (5 minutes) vs successful ones (24 hours)
    const cacheTimeout = result.isValid ? this.config.cacheTimeout : (5 * 60 * 1000);
    const expiresAt = new Date(Date.now() + cacheTimeout);
    
    this.cache[result.url] = {
      result,
      expiresAt
    };

    // Cleanup expired entries periodically
    this.cleanupExpiredCache();
  }

  /**
   * Remove expired entries from cache
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    Object.keys(this.cache).forEach(url => {
      if (now > this.cache[url].expiresAt.getTime()) {
        delete this.cache[url];
      }
    });
  }

  /**
   * Clear all cached results
   */
  clearCache(): void {
    this.cache = {};
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    // This is a simplified implementation
    // In a real scenario, you'd track hits/misses
    return {
      size: Object.keys(this.cache).length,
      hitRate: 0 // Would need to track hits/misses to calculate
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ValidationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): ValidationConfig {
    return { ...this.config };
  }

  /**
   * Temporarily disable caching for debugging
   */
  disableCaching(): void {
    this.config.enableCache = false;
    this.clearCache();
  }

  /**
   * Re-enable caching
   */
  enableCaching(): void {
    this.config.enableCache = true;
  }
}

// Create singleton instance
export const streamValidator = new StreamValidator();