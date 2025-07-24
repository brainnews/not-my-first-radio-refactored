/**
 * Core radio player module with audio management and state control
 */

import { LocalStation, StationListeningTimes } from '@/types/station';
import { PlayerState, AppSettings } from '@/types/app';
import { eventManager } from '@/utils/events';
import { getStorageItem, setStorageItem, StorageKeys } from '@/utils/storage';

export interface RadioPlayerConfig {
  autoPlay?: boolean;
  volume?: number;
  crossfade?: boolean;
  bufferSize?: number;
}

/**
 * Main radio player class handling audio playback and state
 */
export class RadioPlayer {
  private audio: HTMLAudioElement;
  private currentStation: LocalStation | null = null;
  private playerState: PlayerState;
  private settings: AppSettings;
  private autoPlay: boolean;
  private defaultVolume: number;
  private retryAttempts = 0;
  private maxRetries = 3;
  private retryDelay = 2000;
  private fadeInterval: number | null = null;
  private lastTimeUpdate = 0;
  private listeningTimeAccumulator = 0;
  private isPageHidden = false;
  private wasPlayingBeforeHidden = false;
  private visibilityHandler: () => void;
  private pauseEventCleanup: (() => void) | null = null;

  constructor(config: RadioPlayerConfig = {}) {
    // Initialize audio element
    this.audio = new Audio();
    this.audio.preload = 'none';
    this.audio.crossOrigin = 'anonymous';
    
    // Initialize state
    this.playerState = {
      isPlaying: false,
      isPaused: false,
      isLoading: false,
      hasError: false,
      currentTime: 0,
      duration: 0,
      volume: config.volume || 0.7,
      muted: false
    };

    // Load settings
    this.settings = getStorageItem(StorageKeys.SETTINGS, {});

    // Store autoPlay and volume separately since they're no longer in settings
    this.autoPlay = config.autoPlay || false;
    this.defaultVolume = config.volume || 0.7;

    this.setupAudioEvents();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.setupVisibilityHandling();
    this.setVolume(this.defaultVolume);
  }

  /**
   * Set up external event listeners
   */
  private setupEventListeners(): void {
    this.pauseEventCleanup = eventManager.on('station:pause', () => {
      if (this.playerState.isPlaying) {
        this.pause();
      }
    });
  }

  /**
   * Set up audio element event listeners
   */
  private setupAudioEvents(): void {
    this.audio.addEventListener('loadstart', () => {
      this.updatePlayerState({ isLoading: true, hasError: false });
      eventManager.emit('station:loading', this.currentStation);
    });

    this.audio.addEventListener('canplay', () => {
      this.updatePlayerState({ isLoading: false });
      this.retryAttempts = 0;
      eventManager.emit('station:ready', this.currentStation);
    });

    this.audio.addEventListener('play', () => {
      this.updatePlayerState({ isPlaying: true, isPaused: false });
      eventManager.emit('station:play', this.currentStation);
    });

    this.audio.addEventListener('pause', () => {
      this.updatePlayerState({ isPlaying: false, isPaused: true });
      eventManager.emit('station:pause', this.currentStation);
    });

    this.audio.addEventListener('ended', () => {
      this.updatePlayerState({ isPlaying: false, isPaused: false });
      eventManager.emit('station:ended', this.currentStation);
    });

    this.audio.addEventListener('error', (event) => {
      console.error('Audio error:', event);
      this.handlePlaybackError();
    });

    this.audio.addEventListener('stalled', () => {
      console.warn('Audio stalled');
      this.handlePlaybackError();
    });

    this.audio.addEventListener('timeupdate', () => {
      // Update internal state for time only
      this.playerState.currentTime = this.audio.currentTime;
      this.playerState.duration = this.audio.duration || 0;
      
      // Emit time-only event for achievement tracking and other time-based listeners
      eventManager.emit('player:time-changed', {
        currentTime: this.playerState.currentTime,
        duration: this.playerState.duration
      });
      
      // Track listening time for achievements
      this.trackListeningTime();
    });

    this.audio.addEventListener('volumechange', () => {
      this.updatePlayerState({
        volume: this.audio.volume,
        muted: this.audio.muted
      });
    });
  }

  /**
   * Set up page visibility handling for background playback
   */
  private setupVisibilityHandling(): void {
    this.visibilityHandler = () => {
      this.isPageHidden = document.hidden;
      
      if (document.hidden) {
        // Page became hidden - remember if we were playing
        this.wasPlayingBeforeHidden = this.playerState.isPlaying;
      } else {
        // Page became visible - try to resume if we were playing before
        if (this.wasPlayingBeforeHidden && this.currentStation && !this.playerState.isPlaying) {
          // Small delay to let the page settle before resuming
          setTimeout(() => {
            if (!this.playerState.isPlaying && this.currentStation) {
              console.log('[RadioPlayer] Resuming playback after page became visible');
              this.play().catch(error => {
                console.warn('[RadioPlayer] Failed to resume playback:', error);
              });
            }
          }, 500);
        }
        
        // Reset retry attempts when page becomes visible
        if (this.retryAttempts > 0) {
          console.log('[RadioPlayer] Resetting retry attempts after page became visible');
          this.retryAttempts = 0;
        }
      }
    };
    
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  /**
   * Set up keyboard shortcuts for player control
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (event) => {
      // Only handle shortcuts when not in an input field
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          this.togglePlayPause();
          break;
        case 'ArrowUp':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            this.adjustVolume(0.1);
          }
          break;
        case 'ArrowDown':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            this.adjustVolume(-0.1);
          }
          break;
        case 'KeyM':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            this.toggleMute();
          }
          break;
      }
    });
  }

  /**
   * Handle playback errors with retry logic
   */
  private async handlePlaybackError(): Promise<void> {
    // If page is hidden, be more lenient with errors as they're often caused
    // by browser throttling of background tabs
    if (this.isPageHidden) {
      console.log('[RadioPlayer] Playback error while page hidden - will retry when visible');
      // Don't increment retry attempts when page is hidden
      // The visibility handler will attempt to resume when page becomes visible
      return;
    }

    if (this.retryAttempts >= this.maxRetries) {
      this.updatePlayerState({ 
        hasError: true, 
        isLoading: false, 
        isPlaying: false 
      });
      eventManager.emit('station:error', {
        station: this.currentStation,
        error: 'Failed to load station after multiple attempts'
      });
      return;
    }

    this.retryAttempts++;
    this.updatePlayerState({ isLoading: true });
    
    console.log(`[RadioPlayer] Retrying playback (attempt ${this.retryAttempts}/${this.maxRetries})`);
    
    setTimeout(() => {
      if (this.currentStation) {
        this.loadStation(this.currentStation);
      }
    }, this.retryDelay * this.retryAttempts);
  }

  /**
   * Update player state and emit events
   */
  private updatePlayerState(updates: Partial<PlayerState>): void {
    this.playerState = { ...this.playerState, ...updates };
    eventManager.emit('player:state-changed', this.playerState);
  }

  /**
   * Track listening time for achievements and per-station stats
   */
  private trackListeningTime(): void {
    if (!this.playerState.isPlaying || !this.currentStation) {
      this.lastTimeUpdate = 0;
      return;
    }

    const currentTime = Date.now();
    
    if (this.lastTimeUpdate > 0) {
      const timeDelta = currentTime - this.lastTimeUpdate;
      
      // Only count time if delta is reasonable (not paused, seeking, etc.)
      if (timeDelta > 0 && timeDelta < 5000) { // Max 5 seconds between updates
        this.listeningTimeAccumulator += timeDelta;
        
        // Emit listening time update every 30 seconds
        if (this.listeningTimeAccumulator >= 30000) {
          eventManager.emit('player:listening-time', {
            totalTime: this.listeningTimeAccumulator,
            station: this.currentStation
          });
          this.listeningTimeAccumulator = 0;
        }
      }
    }
    
    this.lastTimeUpdate = currentTime;
  }

  /**
   * Flush any accumulated listening time to achievements and per-station stats
   */
  private flushListeningTime(): void {
    if (this.listeningTimeAccumulator > 0 && this.currentStation) {
      eventManager.emit('player:listening-time', {
        totalTime: this.listeningTimeAccumulator,
        station: this.currentStation
      });
      this.listeningTimeAccumulator = 0;
    }
    this.lastTimeUpdate = 0;
  }

  /**
   * Load and prepare a station for playback
   */
  async loadStation(station: LocalStation): Promise<void> {
    if (this.currentStation?.stationuuid === station.stationuuid) {
      return;
    }

    this.stop();
    this.currentStation = station;
    this.retryAttempts = 0;

    try {
      this.updatePlayerState({ isLoading: true, hasError: false });
      
      // Use resolved URL if available, otherwise use the original URL
      const streamUrl = station.url_resolved || station.url;
      this.audio.src = streamUrl;
      
      eventManager.emit('station:selected', station);
      
      if (this.autoPlay) {
        await this.play();
      }
    } catch (error) {
      console.error('Failed to load station:', error);
      this.handlePlaybackError();
    }
  }

  /**
   * Start playback
   */
  async play(): Promise<void> {
    if (!this.currentStation) {
      throw new Error('No station selected');
    }

    try {
      await this.audio.play();
    } catch (error) {
      console.error('Playback failed:', error);
      this.handlePlaybackError();
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    this.audio.pause();
    this.flushListeningTime();
  }

  /**
   * Stop playback and reset
   */
  stop(): void {
    this.audio.pause();
    this.audio.currentTime = 0;
    this.flushListeningTime();
    this.updatePlayerState({ 
      isPlaying: false, 
      isPaused: false, 
      currentTime: 0 
    });
    eventManager.emit('station:stop', this.currentStation);
  }

  /**
   * Toggle play/pause
   */
  async togglePlayPause(): Promise<void> {
    if (this.playerState.isPlaying) {
      this.pause();
    } else {
      await this.play();
    }
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number): void {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    this.audio.volume = clampedVolume;
    this.defaultVolume = clampedVolume;
    setStorageItem(StorageKeys.SETTINGS, this.settings);
    eventManager.emit('player:volume-changed', clampedVolume);
  }

  /**
   * Adjust volume by delta
   */
  adjustVolume(delta: number): void {
    this.setVolume(this.audio.volume + delta);
  }

  /**
   * Toggle mute
   */
  toggleMute(): void {
    this.audio.muted = !this.audio.muted;
    eventManager.emit('player:mute-toggled', this.audio.muted);
  }

  /**
   * Fade in audio
   */
  fadeIn(duration = 1000): void {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
    }

    const originalVolume = this.defaultVolume;
    const steps = 20;
    const stepSize = originalVolume / steps;
    const stepDuration = duration / steps;
    let currentStep = 0;

    this.audio.volume = 0;
    
    this.fadeInterval = window.setInterval(() => {
      currentStep++;
      this.audio.volume = Math.min(stepSize * currentStep, originalVolume);
      
      if (currentStep >= steps) {
        if (this.fadeInterval) {
          clearInterval(this.fadeInterval);
          this.fadeInterval = null;
        }
      }
    }, stepDuration);
  }

  /**
   * Fade out audio
   */
  fadeOut(duration = 1000): Promise<void> {
    return new Promise((resolve) => {
      if (this.fadeInterval) {
        clearInterval(this.fadeInterval);
      }

      const originalVolume = this.audio.volume;
      const steps = 20;
      const stepSize = originalVolume / steps;
      const stepDuration = duration / steps;
      let currentStep = 0;

      this.fadeInterval = window.setInterval(() => {
        currentStep++;
        this.audio.volume = Math.max(originalVolume - (stepSize * currentStep), 0);
        
        if (currentStep >= steps) {
          if (this.fadeInterval) {
            clearInterval(this.fadeInterval);
            this.fadeInterval = null;
          }
          resolve();
        }
      }, stepDuration);
    });
  }

  /**
   * Get current player state
   */
  getState(): PlayerState {
    return { ...this.playerState };
  }

  /**
   * Get current station
   */
  getCurrentStation(): LocalStation | null {
    return this.currentStation;
  }

  /**
   * Get audio element for visualizer access
   */
  getAudioElement(): HTMLAudioElement {
    return this.audio;
  }

  /**
   * Update settings
   */
  updateSettings(newSettings: Partial<AppSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    setStorageItem(StorageKeys.SETTINGS, this.settings);
    eventManager.emit('settings:changed', this.settings);
  }

  /**
   * Get current settings
   */
  getSettings(): AppSettings {
    return { ...this.settings };
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.fadeInterval) {
      clearInterval(this.fadeInterval);
    }
    
    // Clean up event listeners
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    
    if (this.pauseEventCleanup) {
      this.pauseEventCleanup();
    }
    
    this.stop();
    this.flushListeningTime();
    this.audio.src = '';
    this.audio.load(); // Clear the audio element
    
    eventManager.emit('player:destroyed');
  }
}