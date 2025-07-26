/**
 * Stream validation type definitions
 */

/**
 * Station validation status
 */
export enum StationValidationStatus {
  UNKNOWN = 'unknown',
  VALIDATING = 'validating', 
  VALID = 'valid',
  INVALID = 'invalid'
}

/**
 * Station validation state
 */
export interface StationValidationState {
  stationUuid: string;
  status: StationValidationStatus;
  error?: ValidationError;
  responseTime?: number;
  lastChecked?: Date;
}

/**
 * Validation error types
 */
export enum ValidationErrorType {
  NETWORK_ERROR = 'network_error',
  AUDIO_COMPATIBILITY = 'audio_compatibility', 
  TIMEOUT = 'timeout',
  INVALID_URL = 'invalid_url',
  HTTP_ERROR = 'http_error'
}

/**
 * Validation error details
 */
export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  httpStatus?: number;
  retryable: boolean;
}

/**
 * Result of stream validation
 */
export interface ValidationResult {
  url: string;
  isValid: boolean;
  error?: ValidationError;
  responseTime: number;
  lastChecked: Date;
  cached?: boolean;
}

/**
 * Validation cache entry
 */
export interface ValidationCacheEntry {
  result: ValidationResult;
  expiresAt: Date;
}

/**
 * Validation cache storage
 */
export interface ValidationCache {
  [url: string]: ValidationCacheEntry;
}

/**
 * Validation configuration options
 */
export interface ValidationConfig {
  timeout: number;           // Timeout in milliseconds (default: 8000)
  batchSize: number;         // Max concurrent validations (default: 5)
  cacheTimeout: number;      // Cache TTL in milliseconds (default: 24 hours)
  retryAttempts: number;     // Max retry attempts for retryable errors (default: 2)
  retryDelay: number;        // Delay between retries in milliseconds (default: 1000)
  enableCache: boolean;      // Whether to use caching (default: true)
}

/**
 * Validation progress information
 */
export interface ValidationProgress {
  total: number;
  validated: number;
  failed: number;
  inProgress: number;
  percentComplete: number;
}

/**
 * Batch validation result
 */
export interface BatchValidationResult {
  validStations: string[];      // Array of valid station UUIDs
  invalidStations: string[];    // Array of invalid station UUIDs
  pendingStations: string[];    // Array of stations still being validated
  progress: ValidationProgress;
  completed: boolean;
}

/**
 * Default validation configuration
 */
export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  timeout: 8000,              // 8 seconds
  batchSize: 5,               // 5 concurrent validations
  cacheTimeout: 24 * 60 * 60 * 1000, // 24 hours
  retryAttempts: 2,
  retryDelay: 1000,           // 1 second
  enableCache: true
};