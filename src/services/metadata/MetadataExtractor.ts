/**
 * Metadata extraction service for radio station streams
 */

import {
  AudioFormat,
  ICYMetadata,
  StationMetadata,
  MetadataExtractionResult,
  MetadataExtractionStatus,
  MetadataSource,
  MetadataSourceType,
  MetadataExtractionConfig,
  DEFAULT_METADATA_CONFIG,
  CONTENT_TYPE_TO_FORMAT,
  FAVICON_PATHS,
  DOMAIN_COUNTRY_MAPPING
} from '@/types/metadata';
import { radioBrowserApi } from '@/services/api/radioBrowserApi';

/**
 * Service for extracting metadata from radio station streams
 */
export class MetadataExtractor {
  private config: MetadataExtractionConfig;
  private abortController: AbortController | null = null;

  constructor(config: Partial<MetadataExtractionConfig> = {}) {
    this.config = { ...DEFAULT_METADATA_CONFIG, ...config };
  }

  /**
   * Extract comprehensive metadata from a stream URL
   */
  async extractMetadata(url: string): Promise<MetadataExtractionResult> {
    const startTime = Date.now();
    this.abortController = new AbortController();
    
    const sources: MetadataSource[] = [];
    const metadata: StationMetadata = {};

    try {
      // Set up overall timeout
      const timeoutId = setTimeout(() => {
        this.abortController?.abort();
      }, this.config.timeout);

      // Extract ICY metadata if enabled
      if (this.config.enableICYExtraction) {
        const icySource = await this.extractICYMetadataWithSource(url);
        sources.push(icySource);
        if (icySource.success && icySource.data) {
          Object.assign(metadata, icySource.data);
        }
      }

      // Extract audio format from HTTP headers
      const formatSource = await this.detectAudioFormatWithSource(url);
      sources.push(formatSource);
      if (formatSource.success && formatSource.data) {
        Object.assign(metadata, formatSource.data);
      }

      // Extract favicon if enabled
      if (this.config.enableFaviconExtraction) {
        const faviconSource = await this.extractFaviconWithSource(url);
        sources.push(faviconSource);
        if (faviconSource.success && faviconSource.data) {
          Object.assign(metadata, faviconSource.data);
        }
      }

      // Analyze domain for location if enabled
      if (this.config.enableDomainAnalysis) {
        const domainSource = await this.analyzeDomainWithSource(url);
        sources.push(domainSource);
        if (domainSource.success && domainSource.data) {
          Object.assign(metadata, domainSource.data);
        }
      }

      // Radio Browser API fallback if enabled and we have limited metadata
      if (this.config.enableRadioBrowserFallback && (!metadata.name || !metadata.country)) {
        const fallbackSource = await this.radioBrowserFallbackWithSource(url);
        sources.push(fallbackSource);
        if (fallbackSource.success && fallbackSource.data) {
          // Only use fallback data if we don't already have better data
          if (!metadata.name && fallbackSource.data.name) {
            metadata.name = fallbackSource.data.name;
          }
          if (!metadata.country && fallbackSource.data.country) {
            metadata.country = fallbackSource.data.country;
            metadata.countryCode = fallbackSource.data.countryCode;
          }
          if (!metadata.homepage && fallbackSource.data.homepage) {
            metadata.homepage = fallbackSource.data.homepage;
          }
        }
      }

      clearTimeout(timeoutId);

      return {
        status: MetadataExtractionStatus.SUCCESS,
        metadata,
        extractionTime: Date.now() - startTime,
        sources
      };

    } catch (error) {
      const isTimeout = this.abortController?.signal.aborted;
      
      return {
        status: isTimeout ? MetadataExtractionStatus.TIMEOUT : MetadataExtractionStatus.FAILED,
        error: error instanceof Error ? error.message : 'Unknown extraction error',
        extractionTime: Date.now() - startTime,
        sources
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Extract ICY metadata from audio stream headers
   */
  private async extractICYMetadataWithSource(url: string): Promise<MetadataSource> {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.icyTimeout);

      // Create a combined signal that aborts if either the timeout or main abort controller triggers
      const combinedSignal = this.createCombinedAbortSignal([
        controller.signal,
        this.abortController?.signal
      ].filter(Boolean) as AbortSignal[]);

      const response = await fetch(url, {
        method: 'GET',
        signal: combinedSignal,
        headers: {
          'Icy-MetaData': '1',
          'Accept': 'audio/*',
          'User-Agent': 'NotMyFirstRadio/2.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          type: MetadataSourceType.ICY_HEADERS,
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          responseTime: Date.now() - startTime
        };
      }

      const icyMetadata: ICYMetadata = {};
      
      // Extract ICY headers
      const icyName = response.headers.get('icy-name');
      const icyDescription = response.headers.get('icy-description') || response.headers.get('icy-genre');
      const icyBitrate = response.headers.get('icy-br') || response.headers.get('icy-bitrate');
      const icyGenre = response.headers.get('icy-genre');
      const icyUrl = response.headers.get('icy-url');

      if (icyName) icyMetadata.name = icyName.trim();
      if (icyDescription) icyMetadata.description = icyDescription.trim();
      if (icyGenre) icyMetadata.genre = icyGenre.trim();
      if (icyUrl) icyMetadata.url = icyUrl.trim();
      if (icyBitrate) {
        const bitrate = parseInt(icyBitrate, 10);
        if (!isNaN(bitrate)) icyMetadata.bitrate = bitrate;
      }

      // Abort the response to stop downloading stream data
      try {
        controller.abort();
      } catch (abortError) {
        // Ignore abort errors after successful header extraction
      }

      // Convert to StationMetadata format
      const stationMetadata: Partial<StationMetadata> = {};
      if (icyMetadata.name) stationMetadata.name = icyMetadata.name;
      if (icyMetadata.description) stationMetadata.description = icyMetadata.description;
      if (icyMetadata.bitrate) stationMetadata.bitrate = icyMetadata.bitrate;
      if (icyMetadata.genre) stationMetadata.genre = icyMetadata.genre;
      if (icyMetadata.url) stationMetadata.homepage = icyMetadata.url;

      return {
        type: MetadataSourceType.ICY_HEADERS,
        success: Object.keys(stationMetadata).length > 0,
        data: stationMetadata,
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          type: MetadataSourceType.ICY_HEADERS,
          success: false,
          error: 'ICY metadata extraction timed out',
          responseTime: Date.now() - startTime
        };
      }

      return {
        type: MetadataSourceType.ICY_HEADERS,
        success: false,
        error: error instanceof Error ? error.message : 'ICY metadata extraction failed',
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Detect audio format from HTTP headers
   */
  private async detectAudioFormatWithSource(url: string): Promise<MetadataSource> {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // Short timeout for format detection

      const combinedSignal = this.createCombinedAbortSignal([
        controller.signal,
        this.abortController?.signal
      ].filter(Boolean) as AbortSignal[]);

      const response = await fetch(url, {
        method: 'HEAD', // Use HEAD to avoid downloading content
        signal: combinedSignal,
        headers: {
          'Accept': 'audio/*',
          'User-Agent': 'NotMyFirstRadio/2.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return {
          type: MetadataSourceType.HTTP_HEADERS,
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          responseTime: Date.now() - startTime
        };
      }

      const contentType = response.headers.get('content-type')?.toLowerCase();
      let format = AudioFormat.UNKNOWN;
      
      if (contentType) {
        // Check exact matches first
        if (CONTENT_TYPE_TO_FORMAT[contentType]) {
          format = CONTENT_TYPE_TO_FORMAT[contentType];
        } else {
          // Check partial matches
          for (const [type, audioFormat] of Object.entries(CONTENT_TYPE_TO_FORMAT)) {
            if (contentType.includes(type.split('/')[1])) {
              format = audioFormat;
              break;
            }
          }
        }
      }

      const metadata: Partial<StationMetadata> = {
        format,
        contentType: contentType || undefined
      };

      return {
        type: MetadataSourceType.HTTP_HEADERS,
        success: format !== AudioFormat.UNKNOWN,
        data: metadata,
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        type: MetadataSourceType.HTTP_HEADERS,
        success: false,
        error: error instanceof Error ? error.message : 'Audio format detection failed',
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Extract favicon from domain or stream server
   */
  private async extractFaviconWithSource(url: string): Promise<MetadataSource> {
    const startTime = Date.now();

    try {
      const parsedUrl = new URL(url);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

      // Try different favicon paths in order of preference
      for (const path of FAVICON_PATHS) {
        try {
          const faviconUrl = `${baseUrl}${path}`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), this.config.faviconTimeout);

          const combinedSignal = this.createCombinedAbortSignal([
            controller.signal,
            this.abortController?.signal
          ].filter(Boolean) as AbortSignal[]);

          const response = await fetch(faviconUrl, {
            method: 'HEAD',
            signal: combinedSignal
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            const contentType = response.headers.get('content-type');
            // Verify it's actually an image
            if (contentType && contentType.startsWith('image/')) {
              return {
                type: MetadataSourceType.FAVICON_DOMAIN,
                success: true,
                data: { favicon: faviconUrl },
                responseTime: Date.now() - startTime
              };
            }
          }
        } catch (error) {
          // Continue to next path
          continue;
        }
      }

      return {
        type: MetadataSourceType.FAVICON_DOMAIN,
        success: false,
        error: 'No favicon found at common paths',
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        type: MetadataSourceType.FAVICON_DOMAIN,
        success: false,
        error: error instanceof Error ? error.message : 'Favicon extraction failed',
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Analyze domain for location information
   */
  private async analyzeDomainWithSource(url: string): Promise<MetadataSource> {
    const startTime = Date.now();

    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      
      // Check for country-specific TLDs
      for (const [tld, location] of Object.entries(DOMAIN_COUNTRY_MAPPING)) {
        if (hostname.endsWith(tld)) {
          return {
            type: MetadataSourceType.DOMAIN_ANALYSIS,
            success: true,
            data: {
              country: location.country,
              countryCode: location.countryCode
            },
            responseTime: Date.now() - startTime
          };
        }
      }

      // Check for obvious country indicators in subdomain or domain
      const countryIndicators: Record<string, { country: string; countryCode: string }> = {
        'uk': { country: 'United Kingdom', countryCode: 'GB' },
        'usa': { country: 'United States', countryCode: 'US' },
        'canada': { country: 'Canada', countryCode: 'CA' },
        'australia': { country: 'Australia', countryCode: 'AU' },
        'germany': { country: 'Germany', countryCode: 'DE' },
        'france': { country: 'France', countryCode: 'FR' },
        'italy': { country: 'Italy', countryCode: 'IT' },
        'spain': { country: 'Spain', countryCode: 'ES' }
      };

      for (const [indicator, location] of Object.entries(countryIndicators)) {
        if (hostname.includes(indicator)) {
          return {
            type: MetadataSourceType.DOMAIN_ANALYSIS,
            success: true,
            data: {
              country: location.country,
              countryCode: location.countryCode
            },
            responseTime: Date.now() - startTime
          };
        }
      }

      return {
        type: MetadataSourceType.DOMAIN_ANALYSIS,
        success: false,
        error: 'No location indicators found in domain',
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        type: MetadataSourceType.DOMAIN_ANALYSIS,
        success: false,
        error: error instanceof Error ? error.message : 'Domain analysis failed',
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Use Radio Browser API as fallback for metadata
   */
  private async radioBrowserFallbackWithSource(url: string): Promise<MetadataSource> {
    const startTime = Date.now();

    try {
      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname;

      // Search by URL first
      const urlSearchResult = await radioBrowserApi.searchStations({ name: domain, limit: 5 });
      
      if (urlSearchResult.success && urlSearchResult.data && urlSearchResult.data.length > 0) {
        // Find best match by checking if URLs are similar
        const bestMatch = urlSearchResult.data.find(station => {
          const stationUrl = station.url || station.url_resolved || '';
          try {
            const stationParsedUrl = new URL(stationUrl);
            return stationParsedUrl.hostname === domain;
          } catch {
            return false;
          }
        }) || urlSearchResult.data[0];

        const metadata: Partial<StationMetadata> = {};
        if (bestMatch.name) metadata.name = bestMatch.name;
        if (bestMatch.country) metadata.country = bestMatch.country;
        if (bestMatch.countrycode) metadata.countryCode = bestMatch.countrycode.toUpperCase();
        if (bestMatch.homepage) metadata.homepage = bestMatch.homepage;
        if (bestMatch.bitrate) metadata.bitrate = bestMatch.bitrate;
        if (bestMatch.favicon) metadata.favicon = bestMatch.favicon;

        return {
          type: MetadataSourceType.RADIO_BROWSER_FALLBACK,
          success: Object.keys(metadata).length > 0,
          data: metadata,
          responseTime: Date.now() - startTime
        };
      }

      return {
        type: MetadataSourceType.RADIO_BROWSER_FALLBACK,
        success: false,
        error: 'No matching stations found in Radio Browser',
        responseTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        type: MetadataSourceType.RADIO_BROWSER_FALLBACK,
        success: false,
        error: error instanceof Error ? error.message : 'Radio Browser fallback failed',
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Create a combined abort signal from multiple signals
   */
  private createCombinedAbortSignal(signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    
    signals.forEach(signal => {
      if (signal.aborted) {
        controller.abort();
      } else {
        signal.addEventListener('abort', () => controller.abort());
      }
    });

    return controller.signal;
  }

  /**
   * Cancel ongoing metadata extraction
   */
  cancelExtraction(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MetadataExtractionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   */
  getConfig(): MetadataExtractionConfig {
    return { ...this.config };
  }
}

// Create singleton instance
export const metadataExtractor = new MetadataExtractor();