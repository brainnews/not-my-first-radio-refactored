/**
 * Metadata extraction types and interfaces
 */

/**
 * Audio format enumeration
 */
export enum AudioFormat {
  MP3 = 'mp3',
  AAC = 'aac',
  OGG = 'ogg',
  FLAC = 'flac',
  M4A = 'm4a',
  WEBM = 'webm',
  UNKNOWN = 'unknown'
}

/**
 * Metadata extraction status
 */
export enum MetadataExtractionStatus {
  PENDING = 'pending',
  EXTRACTING = 'extracting',
  SUCCESS = 'success',
  FAILED = 'failed',
  TIMEOUT = 'timeout'
}

/**
 * ICY metadata extracted from audio streams
 */
export interface ICYMetadata {
  name?: string;
  description?: string;
  bitrate?: number;
  genre?: string;
  url?: string;
  format?: AudioFormat;
}

/**
 * Location information derived from domain analysis
 */
export interface LocationInfo {
  country?: string;
  countryCode?: string;
  region?: string;
  city?: string;
}

/**
 * Complete station metadata extracted from various sources
 */
export interface StationMetadata {
  name?: string;
  favicon?: string;
  bitrate?: number;
  format?: AudioFormat;
  country?: string;
  countryCode?: string;
  homepage?: string;
  description?: string;
  genre?: string;
  contentType?: string;
}

/**
 * Metadata extraction result with status and error handling
 */
export interface MetadataExtractionResult {
  status: MetadataExtractionStatus;
  metadata?: StationMetadata;
  error?: string;
  extractionTime: number;
  sources: MetadataSource[];
}

/**
 * Source of metadata extraction
 */
export interface MetadataSource {
  type: MetadataSourceType;
  success: boolean;
  data?: Partial<StationMetadata>;
  error?: string;
  responseTime: number;
}

/**
 * Types of metadata sources
 */
export enum MetadataSourceType {
  ICY_HEADERS = 'icy_headers',
  HTTP_HEADERS = 'http_headers',
  FAVICON_DOMAIN = 'favicon_domain',
  FAVICON_ROOT = 'favicon_root',
  DOMAIN_ANALYSIS = 'domain_analysis',
  RADIO_BROWSER_FALLBACK = 'radio_browser_fallback'
}

/**
 * Configuration for metadata extraction
 */
export interface MetadataExtractionConfig {
  timeout: number;                    // Overall timeout in milliseconds
  icyTimeout: number;                 // ICY metadata timeout in milliseconds
  faviconTimeout: number;             // Favicon fetch timeout in milliseconds
  enableICYExtraction: boolean;       // Whether to extract ICY metadata
  enableFaviconExtraction: boolean;   // Whether to fetch favicons
  enableDomainAnalysis: boolean;      // Whether to analyze domain for location
  enableRadioBrowserFallback: boolean; // Whether to use Radio Browser API fallback
  retryAttempts: number;              // Number of retry attempts for failed extractions
  retryDelay: number;                 // Delay between retries in milliseconds
}

/**
 * Default metadata extraction configuration
 */
export const DEFAULT_METADATA_CONFIG: MetadataExtractionConfig = {
  timeout: 10000,                     // 10 seconds overall timeout
  icyTimeout: 5000,                   // 5 seconds for ICY metadata
  faviconTimeout: 3000,               // 3 seconds for favicon
  enableICYExtraction: true,
  enableFaviconExtraction: true,
  enableDomainAnalysis: true,
  enableRadioBrowserFallback: true,
  retryAttempts: 1,
  retryDelay: 1000
};

/**
 * Content type to audio format mapping
 */
export const CONTENT_TYPE_TO_FORMAT: Record<string, AudioFormat> = {
  'audio/mpeg': AudioFormat.MP3,
  'audio/mp3': AudioFormat.MP3,
  'audio/aac': AudioFormat.AAC,
  'audio/aacp': AudioFormat.AAC,
  'audio/ogg': AudioFormat.OGG,
  'audio/vorbis': AudioFormat.OGG,
  'audio/flac': AudioFormat.FLAC,
  'audio/x-flac': AudioFormat.FLAC,
  'audio/mp4': AudioFormat.M4A,
  'audio/m4a': AudioFormat.M4A,
  'audio/webm': AudioFormat.WEBM,
  'application/ogg': AudioFormat.OGG
};

/**
 * Common favicon paths to check
 */
export const FAVICON_PATHS = [
  '/favicon.ico',
  '/favicon.png',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png'
];

/**
 * Country code mappings for domain analysis
 */
export const DOMAIN_COUNTRY_MAPPING: Record<string, { country: string; countryCode: string }> = {
  '.uk': { country: 'United Kingdom', countryCode: 'GB' },
  '.de': { country: 'Germany', countryCode: 'DE' },
  '.fr': { country: 'France', countryCode: 'FR' },
  '.it': { country: 'Italy', countryCode: 'IT' },
  '.es': { country: 'Spain', countryCode: 'ES' },
  '.nl': { country: 'Netherlands', countryCode: 'NL' },
  '.be': { country: 'Belgium', countryCode: 'BE' },
  '.ch': { country: 'Switzerland', countryCode: 'CH' },
  '.at': { country: 'Austria', countryCode: 'AT' },
  '.se': { country: 'Sweden', countryCode: 'SE' },
  '.no': { country: 'Norway', countryCode: 'NO' },
  '.dk': { country: 'Denmark', countryCode: 'DK' },
  '.fi': { country: 'Finland', countryCode: 'FI' },
  '.pl': { country: 'Poland', countryCode: 'PL' },
  '.cz': { country: 'Czech Republic', countryCode: 'CZ' },
  '.hu': { country: 'Hungary', countryCode: 'HU' },
  '.ru': { country: 'Russia', countryCode: 'RU' },
  '.jp': { country: 'Japan', countryCode: 'JP' },
  '.cn': { country: 'China', countryCode: 'CN' },
  '.kr': { country: 'South Korea', countryCode: 'KR' },
  '.au': { country: 'Australia', countryCode: 'AU' },
  '.ca': { country: 'Canada', countryCode: 'CA' },
  '.br': { country: 'Brazil', countryCode: 'BR' },
  '.mx': { country: 'Mexico', countryCode: 'MX' },
  '.ar': { country: 'Argentina', countryCode: 'AR' },
  '.cl': { country: 'Chile', countryCode: 'CL' },
  '.in': { country: 'India', countryCode: 'IN' },
  '.za': { country: 'South Africa', countryCode: 'ZA' }
};