/**
 * Main application class that orchestrates all modules
 */

import { AppState } from '@/types/app';
import { LocalStation } from '@/types/station';
import { eventManager } from '@/utils/events';
import { querySelector } from '@/utils/dom';
import { migrateStorage, StorageKeys } from '@/utils/storage';
import { generateShareQRCode } from '@/utils/qrcode';
import { createStationInitialsImage } from '@/utils/icons';

// Import services
import { sharingService, ShareableStation } from '@/services/sharing/SharingService';
import { radioBrowserApi } from '@/services/api/radioBrowserApi';

// Import all modules
import { RadioPlayer } from '@/modules/player/RadioPlayer';
import { StationManager } from '@/modules/stations/StationManager';
import { NotificationManager } from '@/modules/notifications/NotificationManager';
import { ModalManager } from '@/modules/modals/ModalManager';
import { SettingsManager } from '@/modules/settings/SettingsManager';
import { UserManager } from '@/modules/user/UserManager';
import { AchievementManager } from '@/modules/achievements/AchievementManager';
import { AchievementNotification } from '@/modules/achievements/AchievementNotification';
import { AchievementModal } from '@/modules/achievements/AchievementModal';
import { SearchManager } from '@/modules/search/SearchManager';
import { Navigation } from '@/components/ui/Navigation';
import { LibraryView } from '@/components/ui/LibraryView';
import { SettingsView } from '@/components/ui/SettingsView';
import { SearchView } from '@/components/ui/SearchView';
import { initResponsiveUtils } from '@/utils/responsive';
import { router } from '@/router/Router';

export interface AppConfig {
  version?: string;
  debug?: boolean;
  autoInit?: boolean;
}

/**
 * Main application class that coordinates all modules
 */
export class App {
  private config: AppConfig;
  private state: AppState;
  private isInitialized = false;
  private isDestroyed = false;
  private previousPlayerUIState: {
    stationName?: string;
    stationDetails?: string;
    faviconUrl?: string;
    isPlaying?: boolean;
    isLoading?: boolean;
  } = {};
  private faviconInitialsCache: Map<string, HTMLImageElement> = new Map();

  // Module instances
  private radioPlayer!: RadioPlayer;
  private stationManager!: StationManager;
  private notificationManager!: NotificationManager;
  private modalManager!: ModalManager;
  private settingsManager!: SettingsManager;
  private userManager!: UserManager;
  private achievementManager!: AchievementManager;
  private achievementNotification!: AchievementNotification;
  private achievementModal!: AchievementModal;
  private searchManager!: SearchManager;
  private navigation!: Navigation;
  private libraryView!: LibraryView;
  private settingsView!: SettingsView;
  private searchView!: SearchView;

  constructor(config: AppConfig = {}) {
    this.config = {
      version: '2.0.0',
      debug: true,
      autoInit: true,
      ...config
    };

    // Initialize state (currentView will be set from router after initialization)
    this.state = {
      currentStation: null,
      stations: [],
      isPlaying: false,
      volume: 0.7,
      username: '',
      currentView: 'library',
      settings: {}
    };

    // Set debug mode
    if (this.config.debug) {
      eventManager.setDebugMode(true);
      console.log('[App] Debug mode enabled');
    }

    // Auto-initialize if requested
    if (this.config.autoInit) {
      this.init();
    }
  }

  /**
   * Initialize the application
   */
  async init(): Promise<void> {
    if (this.isInitialized || this.isDestroyed) {
      return;
    }

    try {
      console.log(`[App] Initializing Not My First Radio v${this.config.version}`);

      // Migrate storage if needed
      migrateStorage();

      // Initialize modules in order of dependency
      await this.initializeModules();
      
      // Set up inter-module communication
      this.setupModuleIntegration();
      
      // Set up global event handlers
      this.setupGlobalEventHandlers();
      
      // Handle shared stations from URL (if any)
      await this.handleSharedStations();
      
      // Initial UI setup
      this.setupInitialUI();

      this.isInitialized = true;
      eventManager.emit('app:initialized', this.state);
      
      console.log('[App] Application initialized successfully');
      
      // Show welcome notification for new users
      if (!this.userManager.getUsername()) {
        this.notificationManager.info(
          'Welcome to Not My First Radio! Add stations to your collection and enjoy algorithm-free radio discovery.',
          7000
        );
      }


    } catch (error) {
      console.error('[App] Failed to initialize:', error);
      this.handleCriticalError(error as Error);
    }
  }

  /**
   * Initialize all modules
   */
  private async initializeModules(): Promise<void> {
    // Initialize core modules first
    this.userManager = new UserManager();
    this.settingsManager = new SettingsManager();
    this.notificationManager = new NotificationManager();
    this.modalManager = new ModalManager();

    // Initialize achievement system
    this.achievementManager = new AchievementManager({
      enableNotifications: true,
      notificationDuration: 5000
    });
    this.achievementNotification = new AchievementNotification();
    this.achievementModal = new AchievementModal();

    // Initialize player and station management
    this.radioPlayer = new RadioPlayer({
      volume: 0.7,
      autoPlay: false
    });

    this.stationManager = new StationManager({
      container: querySelector('#stations') as HTMLElement
    });

    // Initialize search manager
    this.searchManager = new SearchManager({
      debounceMs: 500,
      pageSize: 20,
      maxResults: 200
    });

    // Initialize router before navigation
    router.init();
    
    // Sync app state with router's current view
    const currentRouterView = router.getCurrentView();
    if (currentRouterView) {
      this.state.currentView = currentRouterView;
    }

    // Initialize navigation
    this.navigation = new Navigation({
      type: 'tab-bar',
      position: 'top'
    });

    // Initialize library view
    this.libraryView = new LibraryView({
      showWelcome: true
    });


    // Initialize settings view
    this.settingsView = new SettingsView({
      showDataManagement: true,
      showAchievements: true
    });

    // Initialize search view
    this.searchView = new SearchView();

    console.log('[App] All modules initialized');
    
    // Initialize responsive utilities
    initResponsiveUtils();
  }

  /**
   * Handle shared stations from URL parameters
   */
  private async handleSharedStations(): Promise<void> {
    try {
      const sharedData = sharingService.parseSharedData();
      
      if (!sharedData) {
        return; // No shared data found
      }

      console.log('[App] Processing shared stations from URL:', sharedData);

      const stationsToImport: LocalStation[] = [];
      let failedCount = 0;

      // Process each station identifier
      for (const item of sharedData.i) {
        try {
          if (typeof item === 'string') {
            // Radio Browser UUID - fetch from API
            const response = await radioBrowserApi.getStationByUuid(item);
            if (response.success && response.data) {
              stationsToImport.push({
                ...response.data,
                id: this.generateStationId(),
                dateAdded: new Date().toISOString(),
                playCount: 0,
                isFavorite: false
              });
            } else {
              console.warn('[App] Failed to fetch station with UUID:', item);
              failedCount++;
            }
          } else {
            // Manual station object - convert to LocalStation format
            const shareableStation = item as ShareableStation;
            stationsToImport.push({
              id: this.generateStationId(),
              stationuuid: '', // Manual stations don't have UUIDs
              name: shareableStation.name,
              url: shareableStation.url,
              favicon: shareableStation.favicon,
              homepage: shareableStation.homepage,
              bitrate: shareableStation.bitrate,
              countrycode: shareableStation.countrycode,
              note: shareableStation.note,
              dateAdded: new Date().toISOString(),
              playCount: 0,
              isFavorite: false,
              // Add required fields with defaults
              country: shareableStation.countrycode || '',
              votes: 0,
              tags: '',
              language: '',
              clickcount: 0,
              clicktrend: 0,
              state: '',
              codec: '',
              lastchangetime: '',
              lastcheckok: 1,
              lastchecktime: ''
            });
          }
        } catch (error) {
          console.warn('[App] Failed to process shared station:', item, error);
          failedCount++;
        }
      }

      // Show import modal if any stations were successfully processed
      if (stationsToImport.length > 0) {
        this.showSharedStationImportModal(stationsToImport, sharedData, failedCount);
      } else {
        // All stations failed to process
        this.notificationManager.error(
          'Unable to import any stations from the shared link',
          4000
        );
        sharingService.clearShareParams();
      }

    } catch (error) {
      console.error('[App] Error processing shared stations:', error);
      this.notificationManager.error(
        'Failed to process shared stations',
        4000
      );
      
      // Still clear parameters to prevent repeated attempts
      sharingService.clearShareParams();
    }
  }

  /**
   * Show shared station import modal with preview
   */
  private showSharedStationImportModal(stationsToImport: LocalStation[], sharedData: any, failedCount: number): void {
    const currentStations = this.stationManager.getStations();
    const username = sharedData.u || 'Someone';
    const listName = sharedData.name || `${username}'s Stations`;
    
    // Calculate merge impact
    const duplicateStations = this.findDuplicateStationsForShared(stationsToImport, currentStations);
    const newStationsCount = stationsToImport.length - duplicateStations;

    const content = `
      <div style="text-align: left;">
        <div style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 10px 0;">Shared Station List</h4>
          <p><strong>From:</strong> ${listName}</p>
          <p><strong>Stations to import:</strong> ${stationsToImport.length}</p>
          ${failedCount > 0 ? `
            <div style="color: var(--warning-color); margin-top: 10px;">
              <p><strong>⚠️ ${failedCount} stations could not be loaded</strong></p>
            </div>
          ` : ''}
          ${duplicateStations > 0 ? `
            <div style="color: var(--warning-color); margin-top: 10px;">
              <p><strong>Duplicates found:</strong></p>
              <p>• ${duplicateStations} duplicate stations</p>
            </div>
          ` : ''}
        </div>
        
        <div style="background: var(--bg-tertiary); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 10px 0;">Your Current Collection</h4>
          <p><strong>Your stations:</strong> ${currentStations.length}</p>
        </div>

        <h4>Choose import mode:</h4>
        <div style="margin: 15px 0;">
          <div style="padding: 10px; border: 2px solid var(--border-color); border-radius: 6px; margin-bottom: 10px; cursor: pointer;" data-mode="overwrite" id="overwrite-option">
            <strong>🔄 Replace existing stations</strong>
            <p style="margin: 5px 0 0 0; color: var(--text-secondary); font-size: 14px;">
              Replace all your current stations with the shared ones
            </p>
          </div>
          <div style="padding: 10px; border: 2px solid var(--border-color); border-radius: 6px; cursor: pointer;" data-mode="merge" id="merge-option">
            <strong>➕ Add to existing stations</strong>
            <p style="margin: 5px 0 0 0; color: var(--text-secondary); font-size: 14px;">
              Add ${newStationsCount} new stations (duplicates will be ignored)
            </p>
          </div>
        </div>
      </div>
    `;

    // Store selected mode for the import action
    let selectedMode: 'overwrite' | 'merge' | null = null;

    const modal = {
      type: 'confirmation' as const,
      title: 'Import Shared Stations',
      content: content,
      actions: [
        {
          label: 'Cancel',
          style: 'secondary' as const,
          action: () => {
            // Clear share parameters when user cancels
            sharingService.clearShareParams();
          }
        },
        {
          label: 'Import (Select mode first)',
          style: 'primary' as const,
          action: async () => {
            if (!selectedMode) {
              this.notificationManager.warning('Please select an import mode first');
              return;
            }
            await this.executeSharedStationImport(stationsToImport, selectedMode === 'merge', listName);
          }
        }
      ],
      size: 'medium' as const,
      closable: true,
      onClose: () => {
        // Clear share parameters when modal is closed
        sharingService.clearShareParams();
      }
    };

    this.modalManager.open(modal);

    // Add mode selection handling after modal is rendered
    setTimeout(() => {
      const overwriteOption = document.getElementById('overwrite-option');
      const mergeOption = document.getElementById('merge-option');
      
      if (overwriteOption && mergeOption) {
        const selectMode = (mode: 'overwrite' | 'merge', selectedElement: HTMLElement, otherElement: HTMLElement) => {
          // Remove previous selection
          otherElement.style.borderColor = 'var(--border-color)';
          
          // Highlight selected mode
          selectedElement.style.borderColor = 'var(--primary-color)';
          selectedMode = mode;
          
          // Update import button
          const importButton = document.querySelector('.modal-action-primary') as HTMLButtonElement;
          if (importButton) {
            importButton.textContent = mode === 'overwrite' ? 'Replace Stations' : 'Add Stations';
          }
        };

        overwriteOption.addEventListener('click', () => {
          selectMode('overwrite', overwriteOption, mergeOption);
        });

        mergeOption.addEventListener('click', () => {
          selectMode('merge', mergeOption, overwriteOption);
        });
      }
    }, 100);
  }

  /**
   * Find duplicate stations for shared import
   */
  private findDuplicateStationsForShared(importStations: LocalStation[], currentStations: LocalStation[]): number {
    if (!Array.isArray(importStations) || !Array.isArray(currentStations)) return 0;
    
    const currentIds = new Set(currentStations.map(station => station.stationuuid || station.url));
    return importStations.filter(station => 
      (station.stationuuid && currentIds.has(station.stationuuid)) ||
      (!station.stationuuid && currentIds.has(station.url))
    ).length;
  }

  /**
   * Execute shared station import with selected mode
   */
  private async executeSharedStationImport(stationsToImport: LocalStation[], mergeMode: boolean, listName: string): Promise<void> {
    try {
      const importedCount = this.stationManager.importStations(stationsToImport, mergeMode);
      
      // Track import achievement
      eventManager.emit('data:import');
      
      const message = mergeMode 
        ? `Added ${importedCount} stations from "${listName}"`
        : `Imported ${importedCount} stations from "${listName}"`;
      this.notificationManager.success(message, 5000);
      
      console.log(`[App] Successfully imported ${importedCount} shared stations`);
      
      // Clear share parameters after successful import
      sharingService.clearShareParams();
      
    } catch (error) {
      console.error('Shared station import execution failed:', error);
      this.notificationManager.error('Failed to import shared stations');
    }
  }

  /**
   * Generate unique station ID (helper method)
   */
  private generateStationId(): string {
    return `station_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Set up communication between modules
   */
  private setupModuleIntegration(): void {
    // Player ↔ Station Manager integration
    eventManager.on('station:play-request', (station: LocalStation) => {
      this.playStation(station);
    });

    eventManager.on('station:toggle-play', (station: LocalStation) => {
      this.toggleStationPlay(station);
    });

    eventManager.on('player:state-changed', (playerState) => {
      this.state.isPlaying = playerState.isPlaying;
      this.state.volume = playerState.volume;
      this.updatePlayerUI(playerState);
    });

    // Listen for player pause requests (e.g., from preview)
    eventManager.on('player:pause', () => {
      this.radioPlayer.pause();
    });
    // Listen for volume changes from keyboard shortcuts
    eventManager.on('player:volume-changed', (volume) => {
      this.state.volume = volume;
      this.updateVolumeControls();
    });
    // Listen for mute toggle events
    eventManager.on('player:mute-toggled', () => {
      this.updateVolumeControls();
    });

    // Listen for station selection to update UI immediately
    eventManager.on('station:selected', (station) => {
      this.state.currentStation = station;
      this.updatePlayerUI(this.radioPlayer.getState());
    });

    eventManager.on('station:add', (station) => {
      try {
        const addedStation = this.stationManager.addStation(station);
        this.notificationManager.success(`Added "${addedStation.name}" to your collection`);
        this.userManager.incrementStat('totalStationsAdded');
        
        // Track achievement progress
        this.achievementManager.trackProgress('stationAdded', this.userManager.getStats().totalStationsAdded, addedStation);
        eventManager.emit('achievements:check', { trigger: 'station:added', data: addedStation });
      } catch (error) {
        this.notificationManager.error(`Failed to add station: ${(error as Error).message}`);
      }
    });

    // Settings integration
    eventManager.on('settings:changed', (data) => {
      this.state.settings = data.newSettings;
      this.radioPlayer.updateSettings(data.newSettings);
    });

    // User management integration
    eventManager.on('user:username-changed', (username) => {
      this.state.username = username;
    });

    // Modal integration for common actions
    eventManager.on('modal:add-station', () => {
      this.modalManager.showAddStation((stationData) => {
        eventManager.emit('station:add', stationData);
      });
    });

    // Achievement system integration
    eventManager.on('achievements:request-data', (callback) => {
      const categories = this.achievementManager.getCategories();
      const userStats = this.achievementManager.getUserStats();
      callback({ categories, userStats });
    });

    // Track various achievement events
    eventManager.on('station:play', (station) => {
      this.userManager.incrementStat('stationsPlayed');
      this.achievementManager.trackProgress('stationPlayed', 1, station);
    });

    eventManager.on('data:export', () => {
      this.achievementManager.trackProgress('export', 1);
    });

    eventManager.on('data:import', () => {
      this.achievementManager.trackProgress('import', 1);
    });

    eventManager.on('station:share', (station: LocalStation) => {
      this.stationManager.shareStation(station);
      this.achievementManager.trackProgress('qrShare', 1);
    });

    // Handle sharing all stations from library (legacy, still used by some views)
    eventManager.on('stations:share', () => {
      this.showLibraryShareMenu();
    });

    // Handle individual sharing actions from flat menu
    eventManager.on('stations:share-url', () => {
      this.shareStationsAsUrl();
    });

    eventManager.on('stations:share-qr', () => {
      this.shareStationsAsQR();
    });

    eventManager.on('stations:export-json', () => {
      this.exportStationsAsJSON();
    });

    // Handle import modal request from LibraryView
    eventManager.on('data:import-modal', (jsonContent: string) => {
      this.showImportOptionsModal(jsonContent);
    });

    // Track listening time for achievements
    eventManager.on('player:listening-time', (data: { totalTime: number, station: any }) => {
      // Use setTimeout to ensure UserManager syncs global totals first
      setTimeout(() => {
        this.achievementManager.trackProgress('listeningTime', data.totalTime);
      }, 0);
    });

    // View navigation integration  
    eventManager.on('view:change', (view: 'library' | 'settings' | 'search') => {
      // For router-driven changes, just update state without emitting more events
      this.updateViewState(view);
    });

    eventManager.on('view:library', () => {
      this.switchView('library');
    });

    eventManager.on('view:search', () => {
      this.switchView('search');
    });

    eventManager.on('view:settings', () => {
      this.switchView('settings');
    });

    // Handle preview transfer to main player
    eventManager.on('search:transfer-to-main', (data) => {
      this.handlePreviewTransfer(data);
    });

    console.log('[App] Module integration set up');
  }

  /**
   * Update view state from Router (no event emissions to avoid loops)
   */
  private updateViewState(view: 'library' | 'settings' | 'search'): void {
    const previousView = this.state.currentView;
    
    // Skip if switching to the same view
    if (previousView === view) return;
    
    // Handle preview transfer directly when switching away from search
    if (previousView === 'search' && view !== 'search') {
      const searchPreviewState = this.searchManager?.getCurrentPreviewState();
      if (searchPreviewState?.isPlaying && searchPreviewState.station) {
        console.log('[App] Transferring preview to main player');
        this.handlePreviewTransfer({
          station: searchPreviewState.station,
          currentTime: 0 // We don't have current time from the simplified state
        });
      }
    }
    
    // Update the view state
    this.state.currentView = view;
    this.updateViewUI(view, previousView);
    
    console.log(`[App] Router changed view from ${previousView} to ${view}`);
  }

  /**
   * Switch to a different view (public method that emits events)
   */
  private switchView(view: 'library' | 'settings' | 'search'): void {
    this.switchViewInternal(view, true);
  }

  /**
   * Internal view switching implementation
   */
  private switchViewInternal(view: 'library' | 'settings' | 'search', emitEvents: boolean): void {
    const previousView = this.state.currentView;
    
    // Skip if switching to the same view
    if (previousView === view) return;
    
    // Emit view change event BEFORE switching (for preview transfer detection) - only if requested
    if (emitEvents) {
      eventManager.emit('view:change', { 
        from: previousView, 
        to: view 
      });
    }
    
    this.state.currentView = view;
    
    // Update UI immediately without transitions for better performance
    this.updateViewUI(view, previousView);
    
    // Emit view changed event for other modules - only if requested
    if (emitEvents) {
      eventManager.emit('view:changed', { 
        currentView: view, 
        previousView 
      });
    }
    
    console.log(`[App] Switched from ${previousView} to ${view} view`);
  }


  /**
   * Update UI elements for the current view
   */
  private updateViewUI(currentView: 'library' | 'settings' | 'search', _previousView: 'library' | 'settings' | 'search'): void {
    // Get main UI sections (optional for legacy support)
    let settingsPanel: HTMLElement | null = null;
    let settingsOverlay: HTMLElement | null = null;

    try {
      settingsPanel = querySelector('#settings-panel') as HTMLElement;
      settingsOverlay = querySelector('#settings-overlay') as HTMLElement;
    } catch (error) {
      console.log('[App] Settings panel not found - using new settings view');
    }
    
    // Hide all sections first
    if (this.libraryView) {
      this.libraryView.hide();
    }
    if (this.settingsView) {
      this.settingsView.hide();
    }
    if (this.searchView) {
      this.searchView.hide();
    }
    
    if (settingsPanel && settingsOverlay) {
      this.closeSettingsPanel(settingsPanel, settingsOverlay);
    }
    
    // Show the appropriate section based on current view
    switch (currentView) {
      case 'library':
        if (this.libraryView) {
          this.libraryView.show();
        }
        document.body.classList.add('view-library');
        document.body.classList.remove('view-settings', 'view-search');
        console.log('[App] Switched to library view');
        break;
        
      case 'search':
        if (this.searchView) {
          this.searchView.show();
        }
        document.body.classList.add('view-search');
        document.body.classList.remove('view-library', 'view-settings');
        console.log('[App] Switched to search view');
        break;
        
      case 'settings':
        if (this.settingsView) {
          this.settingsView.show();
        }
        // Legacy support
        if (settingsPanel && settingsOverlay) {
          this.openSettingsPanel(settingsPanel, settingsOverlay);
        }
        document.body.classList.add('view-settings');
        document.body.classList.remove('view-library', 'view-search');
        break;
    }
    
    // Update navigation if it exists
    this.updateNavigationState(currentView);
  }

  /**
   * Update navigation state to reflect current view
   */
  private updateNavigationState(currentView: 'library' | 'settings' | 'search'): void {
    // This will be implemented when we create the navigation component
    // For now, just update any existing navigation indicators
    const navItems = document.querySelectorAll('[data-view]');
    navItems.forEach(item => {
      const itemView = item.getAttribute('data-view');
      if (itemView === currentView) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  /**
   * Get current view
   */
  getCurrentView(): 'library' | 'settings' | 'search' {
    return this.state.currentView;
  }

  /**
   * Determine navigation type based on screen size
   */

  /**
   * Set up global event handlers
   */
  private setupGlobalEventHandlers(): void {
    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      console.error('[App] Uncaught error:', event.error);
      this.notificationManager.error('An unexpected error occurred');
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      console.error('[App] Unhandled promise rejection:', event.reason);
      this.notificationManager.error('An unexpected error occurred');
    });

    // Handle online/offline status
    window.addEventListener('online', () => {
      this.notificationManager.success('Connection restored');
    });

    window.addEventListener('offline', () => {
      this.notificationManager.warning('Connection lost - some features may not work');
    });

    // Handle visibility changes (page focus/blur)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        eventManager.emit('app:hidden');
      } else {
        eventManager.emit('app:visible');
      }
    });

    console.log('[App] Global event handlers set up');
  }

  /**
   * Set up initial UI state
   */
  private setupInitialUI(): void {
    // Initialize menu button (optional for legacy support)
    try {
      const menuBtn = querySelector('#menu-btn');
      menuBtn.addEventListener('click', () => {
        this.toggleSettingsPanel();
      });
    } catch (error) {
      console.log('[App] Menu button not found - using new navigation');
    }


    // Initialize settings panel controls
    this.setupSettingsControls();

    // Set up keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Display initial stations
    this.stationManager.renderStations();

    // Initialize the current view
    this.updateViewUI(this.state.currentView, this.state.currentView);

    console.log('[App] Initial UI setup complete');
  }

  /**
   * Set up settings panel controls (legacy support - optional elements)
   */
  private setupSettingsControls(): void {
    try {
      // Settings overlay click to close (legacy)
      const overlay = querySelector('#settings-overlay');
      overlay.addEventListener('click', () => {
        const settingsPanel = querySelector('#settings-panel');
        if (!settingsPanel.classList.contains('hidden')) {
          this.closeSettingsPanel(settingsPanel, overlay);
        }
      });

      // Settings close button (legacy)
      const closeBtn = querySelector('#close-settings');
      closeBtn.addEventListener('click', () => {
        const settingsPanel = querySelector('#settings-panel') as HTMLElement;
        const settingsOverlay = querySelector('#settings-overlay') as HTMLElement;
        this.closeSettingsPanel(settingsPanel, settingsOverlay);
      });

      // Prevent settings panel clicks from closing when clicking inside panel (legacy)
      const settingsPanel = querySelector('#settings-panel') as HTMLElement;
      settingsPanel.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      // Username save functionality - setup when settings panel opens
      // this.setupUsernameControls();

      // Settings panel action buttons - setup when settings panel opens  
      // this.setupSettingsActions();
    } catch (error) {
      console.log('[App] Legacy settings panel not found - using new settings view');
    }
  }

  /**
   * Populate settings content HTML
   */
  private populateSettingsContent(settingsContent: HTMLElement): void {
    settingsContent.innerHTML = `
      <div class="settings-section">
        <h3>Username</h3>
        <div class="username-section">
          <p class="username-hint">This name will be used when sharing your stations with other people.</p>
          <div class="username-input-wrapper">
            <input type="text" id="username-input" class="username-input">
            <button id="save-username" class="save-username-btn">Save</button>
          </div>
        </div>
      </div>
      
      <div class="settings-section">
        <h3>Share & Export Stations</h3>
        <button id="share-url" class="settings-btn">
          <span class="material-symbols-rounded">link</span>
          Share with a link
        </button>
        <button id="share-qr" class="settings-btn">
          <span class="material-symbols-rounded">qr_code</span>
          Share with a QR code
        </button>
        <button id="export-data" class="settings-btn">
          <span class="material-symbols-rounded">download</span>
          Export as .json
        </button>
      </div>
      
      <div class="settings-section">
        <h3>Import Stations</h3>
        <div class="file-input-wrapper settings-btn">
          <input type="file" id="import-file" accept=".json" style="display: none;">
          <label for="import-file">
            <span class="material-symbols-rounded">upload</span>
            Import from a .json file
          </label>
        </div>
        <button id="open-add-station" class="settings-btn">
          <span class="material-symbols-rounded">add_circle</span>
          Add a station manually
        </button>
      </div>
      
      <div class="settings-section">
        <h3>Achievements</h3>
        <button id="open-achievements" class="settings-btn">
          <span class="material-symbols-rounded">emoji_events</span>
          View achievements
        </button>
      </div>
      
      <div class="settings-section">
        <h3>Data Management</h3>
        <button id="clear-stations" class="settings-btn danger">
          <span class="material-symbols-rounded">delete_sweep</span>
          Clear saved stations
        </button>
        <button id="reset-achievements" class="settings-btn danger">
          <span class="material-symbols-rounded">restart_alt</span>
          Reset achievements
        </button>
      </div>
      
      <div class="settings-section" style="margin-top: 4rem;">
        <a href="https://milesgilbert.xyz/thinking/a-certification-for-algorithm-free-platforms/" target="_blank">
          <img src="./images/non-algo-badge.png" alt="Non-Algo Project verified badge" style="width: 100%; max-width: 150px; margin-bottom: 1rem; display: none;">
        </a>
        <p>Not My First Radio is developed by <a href="https://www.milesgilbert.xyz" target="_blank">Miles Gilbert</a> as part of a series of non-algorithmically driven discovery apps. Read more <a href="https://milesgilbert.xyz/thinking/a-certification-for-algorithm-free-platforms/" target="_blank">here</a>.</p>
        <button id="open-terms" class="settings-btn">
          Terms & Privacy Facts
        </button>
      </div>
      <div class="settings-section">
        <a href='https://ko-fi.com/Y8Y61HEIMA' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi1.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>
      </div>
    `;
  }

  /**
   * Set up settings panel controls when panel is opened
   */
  private setupSettingsPanelControls(): void {
    // Only setup once
    if (this.settingsPanelSetup) return;
    this.settingsPanelSetup = true;

    this.setupUsernameControls();
    this.setupSettingsActions();
  }

  private settingsPanelSetup = false;

  /**
   * Set up username controls
   */
  private setupUsernameControls(): void {
    try {
      const usernameInput = querySelector('#username-input') as HTMLInputElement;
      const saveUsernameBtn = querySelector('#save-username');

      // Load current username
      const currentUsername = this.userManager.getUsername();
      if (currentUsername) {
        usernameInput.value = currentUsername;
      }

      // Save username on button click
      saveUsernameBtn.addEventListener('click', () => {
        const newUsername = usernameInput.value.trim();
        if (newUsername) {
          try {
            this.userManager.setUsername(newUsername);
            this.notificationManager.success(`Username saved as "${newUsername}"`);
          } catch (error) {
            this.notificationManager.error(`Failed to save username: ${(error as Error).message}`);
          }
        } else {
          this.notificationManager.error('Please enter a valid username');
        }
      });

      // Save username on Enter key
      usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          (saveUsernameBtn as HTMLButtonElement).click();
        }
      });
    } catch (error) {
      console.warn('Failed to setup username controls:', error);
    }
  }

  /**
   * Set up settings panel action buttons
   */
  private setupSettingsActions(): void {
    try {
      // Share with link button
      const shareUrlBtn = querySelector('#share-url');
      shareUrlBtn.addEventListener('click', async () => {
        await this.shareStationsAsUrl();
      });

      // Share with QR code button
      const shareQrBtn = querySelector('#share-qr');
      shareQrBtn.addEventListener('click', async () => {
        await this.shareStationsAsQR();
      });

      // Export as JSON button
      const exportBtn = querySelector('#export-data');
      exportBtn.addEventListener('click', () => {
        this.exportStationsAsJSON();
      });

      // Import from JSON button
      const importBtn = querySelector('#import-file');
      importBtn.addEventListener('change', (e) => {
        this.handleStationImport(e as Event);
      });

      // Add station manually button
      const addStationBtn = querySelector('#open-add-station');
      addStationBtn.addEventListener('click', () => {
        this.modalManager.showAddStation((stationData) => {
          eventManager.emit('station:add', stationData);
        });
      });

      // Achievements button
      const achievementsBtn = querySelector('#open-achievements');
      achievementsBtn.addEventListener('click', () => {
        this.achievementModal.show();
      });

      // Terms & Privacy Facts button
      const termsBtn = querySelector('#open-terms');
      termsBtn.addEventListener('click', () => {
        this.showTermsModal();
      });

      // Data management buttons
      this.setupDataManagementButtons();
    } catch (error) {
      console.warn('Failed to setup settings actions:', error);
    }
  }

  /**
   * Set up data management buttons with confirmations
   */
  private setupDataManagementButtons(): void {
    try {
      const clearStationsBtn = querySelector('#clear-stations');
      const resetAchievementsBtn = querySelector('#reset-achievements');

      clearStationsBtn.addEventListener('click', () => {
        this.modalManager.confirm(
          'Clear All Stations',
          'Are you sure you want to clear all saved stations? This cannot be undone.',
          () => {
            this.stationManager.clearStations();
            this.notificationManager.success('All stations cleared');
          }
        );
      });


      resetAchievementsBtn.addEventListener('click', () => {
        this.modalManager.confirm(
          'Reset Achievements',
          'Are you sure you want to reset all achievements? This cannot be undone.',
          () => {
            this.achievementManager.resetAllAchievements();
            this.notificationManager.success('All achievements reset');
          }
        );
      });
    } catch (error) {
      console.warn('Failed to setup data management buttons:', error);
    }
  }

  /**
   * Set button loading state
   */
  private setButtonLoading(buttonId: string, loading: boolean): void {
    try {
      const button = querySelector(buttonId) as HTMLButtonElement;
      
      if (loading) {
        // Store original HTML content if not already stored
        if (!button.getAttribute('data-original-html')) {
          button.setAttribute('data-original-html', button.innerHTML);
        }
        button.disabled = true;
        button.innerHTML = '<span class="material-symbols-rounded spinning">progress_activity</span> ' + (buttonId.includes('qr') ? 'Generating QR...' : 'Creating Link...');
        button.style.opacity = '0.7';
      } else {
        button.disabled = false;
        const originalHtml = button.getAttribute('data-original-html');
        if (originalHtml) {
          button.innerHTML = originalHtml;
        }
        button.style.opacity = '1';
      }
    } catch (error) {
      console.warn('[App] Failed to update button state:', error);
    }
  }

  /**
   * Share stations as URL
   */
  private async shareStationsAsUrl(): Promise<void> {
    this.setButtonLoading('#share-url', true);
    
    try {
      const stations = this.stationManager.getStations();
      if (stations.length === 0) {
        this.notificationManager.warning('No stations to share');
        return;
      }

      const username = this.userManager.getUsername();
      const shareData = await this.stationManager.shareStations(stations, username ? `${username}'s Stations` : 'My Stations', username);
      
      // Track sharing achievement
      eventManager.emit('station:share');
      
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareData);
        this.notificationManager.success('Share link copied to clipboard');
      } else {
        this.notificationManager.info(`Share link: ${shareData}`);
      }
    } catch (error) {
      this.notificationManager.error('Failed to create share link');
    } finally {
      this.setButtonLoading('#share-url', false);
    }
  }

  /**
   * Share stations as QR code
   */
  private async shareStationsAsQR(): Promise<void> {
    this.setButtonLoading('#share-qr', true);
    
    try {
      const stations = this.stationManager.getStations();
      if (stations.length === 0) {
        this.notificationManager.warning('No stations to share');
        return;
      }

      const username = this.userManager.getUsername();
      const shareData = await this.stationManager.shareStations(stations, username ? `${username}'s Stations` : 'My Stations', username);
      
      // Track sharing achievement
      eventManager.emit('station:share');
      
      // Generate QR code
      const qrCodeDataUrl = await generateShareQRCode(shareData, false);
      
      // Show QR code modal
      this.modalManager.showQRCode(
        'Share Your Stations',
        qrCodeDataUrl,
        'Scan this QR code with your phone\'s camera to import these stations.'
      );
      
    } catch (error) {
      console.error('QR code generation error:', error);
      this.notificationManager.error('Failed to create QR code');
    } finally {
      this.setButtonLoading('#share-qr', false);
    }
  }

  /**
   * Show share options menu for stations library
   */
  private showLibraryShareMenu(): void {
    const stations = this.stationManager.getStations();
    if (stations.length === 0) {
      this.notificationManager.warning('No stations to share');
      return;
    }

    // Remove existing menu if present
    const existingMenu = document.querySelector('.library-share-menu');
    const existingOverlay = document.querySelector('.library-share-menu-overlay');
    if (existingMenu) existingMenu.remove();
    if (existingOverlay) existingOverlay.remove();

    // Create menu overlay
    const overlay = document.createElement('div');
    overlay.className = 'library-share-menu-overlay';
    overlay.addEventListener('click', () => {
      this.closeLibraryShareMenu();
    });

    // Create menu
    const menu = document.createElement('div');
    menu.className = 'library-share-menu';
    
    // Create menu list
    const menuList = document.createElement('div');
    menuList.className = 'library-share-menu-list';

    // Add station option
    const addStationItem = document.createElement('div');
    addStationItem.className = 'library-share-menu-item';
    addStationItem.innerHTML = `
      <span class="material-symbols-rounded">add</span>
      <span>Add Station</span>
    `;
    addStationItem.addEventListener('click', () => {
      this.closeLibraryShareMenu();
      eventManager.emit('modal:add-station');
    });

    // Share with URL option
    const shareUrlItem = document.createElement('div');
    shareUrlItem.className = 'library-share-menu-item';
    shareUrlItem.innerHTML = `
      <span class="material-symbols-rounded">link</span>
      <span>Share with Link</span>
    `;
    shareUrlItem.addEventListener('click', async () => {
      this.closeLibraryShareMenu();
      await this.shareStationsAsUrl();
    });

    // Share with QR code option
    const shareQrItem = document.createElement('div');
    shareQrItem.className = 'library-share-menu-item';
    shareQrItem.innerHTML = `
      <span class="material-symbols-rounded">qr_code</span>
      <span>Share with QR Code</span>
    `;
    shareQrItem.addEventListener('click', async () => {
      this.closeLibraryShareMenu();
      await this.shareStationsAsQR();
    });

    // Export as JSON option
    const exportJsonItem = document.createElement('div');
    exportJsonItem.className = 'library-share-menu-item';
    exportJsonItem.innerHTML = `
      <span class="material-symbols-rounded">download</span>
      <span>Export as JSON</span>
    `;
    exportJsonItem.addEventListener('click', () => {
      this.closeLibraryShareMenu();
      this.exportStationsAsJSON();
    });

    // Add items to menu
    menuList.appendChild(addStationItem);
    menuList.appendChild(shareUrlItem);
    menuList.appendChild(shareQrItem);
    menuList.appendChild(exportJsonItem);
    menu.appendChild(menuList);

    // Add to DOM
    document.body.appendChild(overlay);
    document.body.appendChild(menu);

    // Position menu near share button (desktop) or slide up (mobile)
    this.positionLibraryShareMenu(menu);

    // Add escape key handler
    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeLibraryShareMenu();
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);
  }

  /**
   * Close the library share menu
   */
  private closeLibraryShareMenu(): void {
    const menu = document.querySelector('.library-share-menu') as HTMLElement;
    const overlay = document.querySelector('.library-share-menu-overlay') as HTMLElement;
    
    if (menu) {
      menu.classList.add('closing');
      setTimeout(() => menu.remove(), 150);
    }
    if (overlay) {
      overlay.remove();
    }
  }

  /**
   * Position the library share menu
   */
  private positionLibraryShareMenu(menu: HTMLElement): void {
    // On mobile, the menu will slide up from bottom via CSS
    // On desktop, try to position near the share button
    const shareButton = document.querySelector('.library-action-btn[title="More options"]') as HTMLElement;
    
    if (shareButton && window.innerWidth > 768) {
      const rect = shareButton.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.top = `${rect.bottom + 8}px`;
      menu.style.left = `${rect.left}px`;
      menu.style.right = 'auto';
      menu.style.transform = 'none';
    }
    
    // Trigger animation
    setTimeout(() => {
      menu.classList.add('visible');
    }, 10);
  }

  /**
   * Export stations as JSON
   */
  private exportStationsAsJSON(): void {
    try {
      const data = this.settingsManager.exportSettings();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `nmfr-backup-${new Date().toISOString().split('T')[0]}.json`;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      // Track export achievement
      eventManager.emit('data:export');
      
      this.notificationManager.success('Stations exported successfully');
    } catch (error) {
      this.notificationManager.error('Failed to export stations');
    }
  }

  /**
   * Handle station import from file
   */
  private handleStationImport(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        
        if (!content || content.trim().length === 0) {
          this.notificationManager.error('File appears to be empty');
          return;
        }
        
        this.showImportOptionsModal(content);
      } catch (error) {
        console.error('Error reading file:', error);
        this.notificationManager.error('Failed to read import file');
      }
      
      // Clear the input so the same file can be selected again
      input.value = '';
    };
    
    reader.onerror = () => {
      this.notificationManager.error('Failed to read import file');
      input.value = '';
    };
    
    reader.readAsText(file);
  }

  /**
   * Show import options modal with preview
   */
  private showImportOptionsModal(jsonContent: string): void {
    try {
      const data = JSON.parse(jsonContent);
      const importStations = data[StorageKeys.STATIONS] || [];
      
      // More lenient validation - as long as we have valid JSON, proceed
      if (!Array.isArray(importStations) || importStations.length === 0) {
        this.notificationManager.error('No stations found in the imported file');
        return;
      }

      // Get current station counts for comparison
      const currentStations = this.stationManager.getStations();
      
      // Calculate merge impact
      const duplicateStations = this.findDuplicateStations(importStations, currentStations);
      
      const newStationsCount = importStations.length - duplicateStations;

      const content = `
        <div style="text-align: left;">
          <div style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px 0;">Import Preview</h4>
            <p><strong>Stations to import:</strong> ${importStations.length}</p>
            ${duplicateStations > 0 ? `
              <div style="color: var(--warning-color); margin-top: 10px;">
                <p><strong>Duplicates found:</strong></p>
                <p>• ${duplicateStations} duplicate stations</p>
              </div>
            ` : ''}
          </div>
          
          <div style="background: var(--bg-tertiary); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin: 0 0 10px 0;">Current Collection</h4>
            <p><strong>Your stations:</strong> ${currentStations.length}</p>
          </div>

          <h4>Choose import mode:</h4>
          <div style="margin: 15px 0;">
            <div style="padding: 10px; border: 2px solid var(--border-color); border-radius: 6px; margin-bottom: 10px; cursor: pointer;" data-mode="overwrite" id="overwrite-option">
              <strong>🔄 Overwrite existing stations</strong>
              <p style="margin: 5px 0 0 0; color: var(--text-secondary); font-size: 14px;">
                Replace all your current stations with the imported ones
              </p>
            </div>
            <div style="padding: 10px; border: 2px solid var(--border-color); border-radius: 6px; cursor: pointer;" data-mode="merge" id="merge-option">
              <strong>➕ Merge with existing stations</strong>
              <p style="margin: 5px 0 0 0; color: var(--text-secondary); font-size: 14px;">
                Add ${newStationsCount} new stations (duplicates will be ignored)
              </p>
            </div>
          </div>
        </div>
      `;

      // Store selected mode for the import action
      let selectedMode: 'overwrite' | 'merge' | null = null;

      const modal = {
        type: 'confirmation' as const,
        title: 'Import Stations',
        content: content,
        actions: [
          {
            label: 'Cancel',
            style: 'secondary' as const,
            action: () => {}
          },
          {
            label: 'Import (Select mode first)',
            style: 'primary' as const,
            action: async () => {
              if (!selectedMode) {
                this.notificationManager.warning('Please select an import mode first');
                return;
              }
              
              await this.executeImport(jsonContent, selectedMode === 'merge');
            }
          }
        ],
        size: 'medium' as const,
        closable: true
      };

      this.modalManager.open(modal);

      // Add mode selection handling after modal is rendered
      setTimeout(() => {
        const overwriteOption = document.getElementById('overwrite-option');
        const mergeOption = document.getElementById('merge-option');
        
        if (overwriteOption && mergeOption) {
          const selectMode = (mode: 'overwrite' | 'merge', selectedElement: HTMLElement, otherElement: HTMLElement) => {
            // Remove previous selection
            otherElement.style.borderColor = 'var(--border-color)';
            
            // Highlight selected mode
            selectedElement.style.borderColor = 'var(--primary-color)';
            selectedMode = mode;
            
            // Update import button
            const importButton = document.querySelector('.modal-action-primary') as HTMLButtonElement;
            if (importButton) {
              importButton.textContent = mode === 'overwrite' ? 'Overwrite Stations' : 'Merge Stations';
            }
          };

          overwriteOption.addEventListener('click', () => {
            selectMode('overwrite', overwriteOption, mergeOption);
          });

          mergeOption.addEventListener('click', () => {
            selectMode('merge', mergeOption, overwriteOption);
          });
        }
      }, 100);

    } catch (error) {
      console.error('Failed to parse import file:', error);
      
      if (error instanceof SyntaxError) {
        this.notificationManager.error('Invalid JSON file format - please check the file is valid JSON');
      } else {
        this.notificationManager.error('Failed to process import file: ' + (error as Error).message);
      }
    }
  }

  /**
   * Find duplicate stations by UUID
   */
  private findDuplicateStations(importStations: any[], currentStations: any[]): number {
    if (!Array.isArray(importStations) || !Array.isArray(currentStations)) return 0;
    
    const currentIds = new Set(currentStations.map(station => station.stationuuid));
    return importStations.filter(station => 
      station.stationuuid && currentIds.has(station.stationuuid)
    ).length;
  }


  /**
   * Execute the import with selected mode
   */
  private async executeImport(jsonContent: string, mergeMode: boolean): Promise<void> {
    try {
      const success = this.settingsManager.importSettings(jsonContent, mergeMode);
      
      if (success) {
        // Track import achievement
        eventManager.emit('data:import');
        
        const message = mergeMode ? 'Stations merged successfully' : 'Stations imported successfully';
        this.notificationManager.success(message);
        
        // Reload only station data from storage and refresh the UI
        this.stationManager.reloadStationsFromStorage();
        this.stationManager.renderStations();
      } else {
        this.notificationManager.error('Failed to import stations - invalid file format');
      }
    } catch (error) {
      console.error('Import execution failed:', error);
      this.notificationManager.error('Failed to import stations');
    }
  }

  /**
   * Set up global keyboard shortcuts
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (event) => {
      // Don't handle shortcuts when typing in inputs
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.code) {
        case 'Escape':
          if (this.modalManager.isOpen()) {
            this.modalManager.close();
          }
          break;
        case 'KeyH':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            this.showHelp();
          }
          break;
      }
    });
  }

  /**
   * Play a station
   */
  private async playStation(station: LocalStation): Promise<void> {
    try {
      await this.radioPlayer.loadStation(station);
      await this.radioPlayer.play(); // Explicitly start playback
      this.state.currentStation = station;
      this.userManager.incrementStat('stationsPlayed');
      
      // Track achievements for playing
      eventManager.emit('station:play', station);
      eventManager.emit('achievements:check', 'station:play');
    } catch (error) {
      console.error('[App] Failed to play station:', error);
      this.notificationManager.error(`Failed to play "${station.name}"`);
    }
  }

  /**
   * Toggle play/pause for a station
   */
  private async toggleStationPlay(station: LocalStation): Promise<void> {
    try {
      // Check if this station is currently playing
      const currentStation = this.radioPlayer.getCurrentStation();
      const isPlaying = this.state.isPlaying;
      
      if (currentStation && 
          (currentStation.stationuuid === station.stationuuid || 
           (currentStation.url === station.url && currentStation.name === station.name))) {
        // Same station is loaded - toggle play/pause
        if (isPlaying) {
          this.radioPlayer.pause();
        } else {
          await this.radioPlayer.play();
        }
      } else {
        // Different station - load and play it
        await this.playStation(station);
      }
    } catch (error) {
      console.error('[App] Failed to toggle station playback:', error);
      this.notificationManager.error(`Failed to control "${station.name}"`);
    }
  }

  /**
   * Handle preview transfer to main player
   */
  private async handlePreviewTransfer(data: { station: any; currentTime: number }): Promise<void> {
    try {
      console.log('[App] Transferring preview to main player:', data.station.name);
      
      // Convert the preview station to LocalStation format if needed
      const stationToPlay = {
        ...data.station,
        // Ensure it has the required LocalStation properties
        id: data.station.id || `transfer_${Date.now()}`,
        dateAdded: data.station.dateAdded || new Date().toISOString(),
        playCount: data.station.playCount || 0,
        isFavorite: data.station.isFavorite || false
      };
      
      // Load and play the station in the main player
      await this.radioPlayer.loadStation(stationToPlay);
      await this.radioPlayer.play();
      
      // Update app state
      this.state.currentStation = stationToPlay;
      
      // Update UI to reflect the new playing station
      this.updatePlayerUI(this.radioPlayer.getState());
      
      // Emit events for tracking
      eventManager.emit('station:play', stationToPlay);
      eventManager.emit('station:selected', stationToPlay);
      
    } catch (error) {
      console.error('[App] Failed to transfer preview to main player:', error);
      this.notificationManager.error('Failed to transfer preview to main player');
    }
  }

  /**
   * Update player UI elements
   */
  private updatePlayerUI(playerState: any): void {
    const playerBar = querySelector('.player-bar');
    const stationName = querySelector('#station-name');
    const stationDetails = querySelector('#station-details');
    const playPauseBtn = querySelector('#play-pause');
    const nowPlaying = querySelector('.now-playing');

    // Build current UI state for comparison
    const currentUIState = {
      stationName: this.state.currentStation?.name || 'Select a station',
      stationDetails: this.state.currentStation ? this.buildStationDetails(this.state.currentStation) : '',
      faviconUrl: this.state.currentStation?.favicon || '',
      isPlaying: playerState.isPlaying,
      isLoading: playerState.isLoading
    };

    if (this.state.currentStation) {
      // Show player bar
      playerBar.classList.add('active');
      
      // Update station info only if changed
      if (this.previousPlayerUIState.stationName !== currentUIState.stationName) {
        stationName.textContent = currentUIState.stationName;
        this.updatePageTitle(); // Only update when station name changes
      }
      
      // Update station details only if changed
      if (this.previousPlayerUIState.stationDetails !== currentUIState.stationDetails) {
        stationDetails.textContent = currentUIState.stationDetails;
      }
      
      // Update favicon only if changed
      if (this.previousPlayerUIState.faviconUrl !== currentUIState.faviconUrl) {
        this.updateFaviconContainer(this.state.currentStation);
      }

      // Handle loading state only if changed
      if (this.previousPlayerUIState.isLoading !== currentUIState.isLoading) {
        const staticDiv = querySelector('.static');
        if (playerState.isLoading) {
          nowPlaying.classList.add('loading');
          staticDiv.classList.remove('hidden');
        } else {
          nowPlaying.classList.remove('loading');
          staticDiv.classList.add('hidden');
        }
      }
    } else {
      // Hide player bar when no station (only if previously had station)
      if (this.previousPlayerUIState.stationName !== 'Select a station') {
        playerBar.classList.remove('active');
        stationName.textContent = 'Select a station';
        stationDetails.textContent = '';
        
        // Clear favicon container
        const faviconContainer = querySelector('#current-favicon-container');
        faviconContainer.innerHTML = '';
        
        // Reset page title when no station
        this.updatePageTitle();
      }
    }

    // Update play/pause button only if state changed
    if (this.previousPlayerUIState.isPlaying !== currentUIState.isPlaying || 
        this.previousPlayerUIState.isLoading !== currentUIState.isLoading) {
      const playIcon = playPauseBtn.querySelector('.material-symbols-rounded');
      if (playIcon) {
        if (playerState.isLoading) {
          playIcon.textContent = 'progress_activity';
          playIcon.classList.add('spinning');
        } else {
          playIcon.textContent = playerState.isPlaying ? 'pause' : 'play_arrow';
          playIcon.classList.remove('spinning');
        }
      }
      
      // Update page title when playing state changes
      if (this.previousPlayerUIState.isPlaying !== currentUIState.isPlaying) {
        this.updatePageTitle();
      }
    }

    // Set up play/pause button click handler (only set once)
    if (!playPauseBtn.hasAttribute('data-handler-set')) {
      playPauseBtn.addEventListener('click', () => {
        this.radioPlayer.togglePlayPause();
      });
      playPauseBtn.setAttribute('data-handler-set', 'true');
    }

    // Set up volume control handlers (only set once)
    const muteToggle = querySelector('#mute-toggle');
    const volumeSlider = querySelector('#volume-slider') as HTMLInputElement;
    
    if (muteToggle && !muteToggle.hasAttribute('data-handler-set')) {
      muteToggle.addEventListener('click', () => {
        this.radioPlayer.toggleMute();
      });
      muteToggle.setAttribute('data-handler-set', 'true');
    }
    
    if (volumeSlider && !volumeSlider.hasAttribute('data-handler-set')) {
      volumeSlider.addEventListener('input', (event) => {
        const target = event.target as HTMLInputElement;
        const volume = parseInt(target.value) / 100; // Convert 0-100 to 0-1
        this.radioPlayer.setVolume(volume);
      });
      volumeSlider.setAttribute('data-handler-set', 'true');
    }
    
    // Update volume controls to reflect current state
    if (muteToggle && volumeSlider) {
      const currentState = this.radioPlayer.getState();
      const muteIcon = muteToggle.querySelector('.material-symbols-rounded');
      
      // Update mute button icon
      if (muteIcon) {
        muteIcon.textContent = currentState.muted ? 'volume_off' : 'volume_up';
      }
      
      // Update volume slider value (convert 0-1 to 0-100)
      volumeSlider.value = Math.round(currentState.volume * 100).toString();
    }

    // Store current state for next comparison
    this.previousPlayerUIState = { ...currentUIState };
  }

  /**
   * Update volume controls UI elements
   */
  private updateVolumeControls(): void {
    const muteToggle = querySelector('#mute-toggle');
    const volumeSlider = querySelector('#volume-slider') as HTMLInputElement;
    
    if (muteToggle && volumeSlider) {
      const currentState = this.radioPlayer.getState();
      const muteIcon = muteToggle.querySelector('.material-symbols-rounded');
      
      // Update mute button icon
      if (muteIcon) {
        muteIcon.textContent = currentState.muted ? 'volume_off' : 'volume_up';
      }
      
      // Update volume slider value (convert 0-1 to 0-100)
      volumeSlider.value = Math.round(currentState.volume * 100).toString();
    }
  }

  /**
   * Build station details string
   */
  private buildStationDetails(station: LocalStation): string {
    const details = [];
    if (station.bitrate && station.bitrate > 0) {
      details.push(`${station.bitrate}kbps`);
    }
    if (station.countrycode || station.country) {
      details.push(station.countrycode || station.country);
    }
    return details.join(' • ');
  }

  /**
   * Update favicon container with caching
   */
  private updateFaviconContainer(station: LocalStation): void {
    const faviconContainer = querySelector('#current-favicon-container');
    
    if (station.favicon) {
      // Clear any existing content
      faviconContainer.innerHTML = '';
      
      // Create new img element with error handling
      const imgElement = document.createElement('img');
      imgElement.id = 'current-favicon';
      imgElement.className = 'current-favicon';
      imgElement.src = station.favicon;
      imgElement.alt = 'Station logo';
      
      // Add error handler to show cached initials if favicon fails to load
      imgElement.addEventListener('error', () => {
        this.showCachedInitials(faviconContainer, station);
      });
      
      faviconContainer.appendChild(imgElement);
    } else {
      // No favicon available, show cached initials
      this.showCachedInitials(faviconContainer, station);
    }
  }

  /**
   * Show cached initials image or create and cache if not exists
   */
  private showCachedInitials(container: Element, station: LocalStation): void {
    const stationName = station.customName || station.name;
    const cacheKey = `${stationName}-48`;
    
    // Clear container
    container.innerHTML = '';
    
    // Check if we have cached initials
    if (this.faviconInitialsCache.has(cacheKey)) {
      const cachedImg = this.faviconInitialsCache.get(cacheKey)!;
      // Clone the cached image to avoid DOM issues
      const clonedImg = cachedImg.cloneNode(true) as HTMLImageElement;
      container.appendChild(clonedImg);
    } else {
      // Create new initials image and cache it
      const initialsImg = createStationInitialsImage(stationName, 48);
      this.faviconInitialsCache.set(cacheKey, initialsImg.cloneNode(true) as HTMLImageElement);
      container.appendChild(initialsImg);
      
      // Limit cache size to prevent memory issues
      if (this.faviconInitialsCache.size > 50) {
        // Remove oldest entries
        const firstKey = this.faviconInitialsCache.keys().next().value;
        if (firstKey) {
          this.faviconInitialsCache.delete(firstKey);
        }
      }
    }
  }

  /**
   * Toggle settings panel with proper slide animation
   */
  private toggleSettingsPanel(): void {
    if (this.state.currentView === 'settings') {
      // If we're in settings view, go back to library
      this.switchView('library');
    } else {
      // Switch to settings view
      this.switchView('settings');
    }
  }

  /**
   * Open settings panel with slide animation
   */
  private openSettingsPanel(settingsPanel: HTMLElement, overlay: HTMLElement): void {
    // Remove hidden class first
    settingsPanel.classList.remove('hidden');
    overlay.classList.remove('hidden');
    
    // Ensure display is block (override hidden class)
    settingsPanel.style.display = 'block';
    overlay.style.display = 'block';
    
    // Force visibility of all content
    settingsPanel.style.visibility = 'visible';
    settingsPanel.style.opacity = '1';
    
    // Populate settings content if it's empty
    const settingsContent = settingsPanel.querySelector('.settings-content');
    if (settingsContent && settingsContent.children.length === 0) {
      this.populateSettingsContent(settingsContent as HTMLElement);
    }
    
    // Set up panel controls now that elements are visible
    this.setupSettingsPanelControls();
    
    // Prevent body scrolling
    document.body.style.overflow = 'hidden';
    document.body.style.height = '100vh';
    
    // Use setTimeout to ensure transitions work properly
    setTimeout(() => {
      settingsPanel.classList.add('visible');
      overlay.classList.add('visible');
    }, 10);
  }

  /**
   * Close settings panel with slide animation
   */
  private closeSettingsPanel(settingsPanel: HTMLElement, overlay: HTMLElement): void {
    // Remove visible class to trigger slide-out animation
    settingsPanel.classList.remove('visible');
    overlay.classList.remove('visible');
    
    // Restore body scrolling
    document.body.style.overflow = 'auto';
    document.body.style.height = 'auto';
    
    // Wait for transition to complete before hiding
    setTimeout(() => {
      settingsPanel.classList.add('hidden');
      overlay.classList.add('hidden');
      // Reset all inline styles
      settingsPanel.style.cssText = '';
      overlay.style.cssText = '';
    }, 300);
  }

  /**
   * Update page title based on current station and playing state
   */
  private updatePageTitle(): void {
    const defaultTitle = 'Not My First Radio - Algorithm-Free Internet Radio Player';
    
    if (this.state.currentStation && this.state.isPlaying) {
      document.title = `📡 ${this.state.currentStation.name} on NMFR`;
    } else {
      document.title = defaultTitle;
    }
  }

  /**
   * Show help modal
   */
  private showHelp(): void {
    const helpContent = `
      <h3>Keyboard Shortcuts</h3>
      <ul>
        <li><kbd>Space</kbd> - Play/Pause</li>
        <li><kbd>Ctrl/Cmd + H</kbd> - Show help</li>
        <li><kbd>Ctrl/Cmd + ↑/↓</kbd> - Volume control</li>
        <li><kbd>Ctrl/Cmd + M</kbd> - Mute/unmute</li>
        <li><kbd>Escape</kbd> - Close modals</li>
      </ul>
      <h3>Features</h3>
      <ul>
        <li>Browse and manage your radio station collection</li>
        <li>Save your favorite stations</li>
        <li>Share station lists with friends</li>
        <li>Track listening achievements</li>
        <li>No algorithms - discover music naturally</li>
      </ul>
    `;

    this.modalManager.open({
      type: 'terms',
      title: 'Help & Information',
      content: helpContent,
      size: 'medium'
    });
  }

  /**
   * Show Terms & Privacy Facts modal
   */
  private showTermsModal(): void {
    const termsContent = `
      <div class="terms-content">
        <div class="serving-size">
          <h3>Serving Size: 1 App</h3>
          <div class="divider"></div>
        </div>

        <div class="data-facts">
          <h3>Data Collection Facts</h3>
          <div class="fact-row">
            <span>Personal Data</span>
            <span class="percentage">0%</span>
          </div>
          <div class="fact-row">
            <span>Tracking</span>
            <span class="percentage">0%</span>
          </div>
          <div class="fact-row">
            <span>Cookies</span>
            <span class="percentage">0%</span>
          </div>
          <div class="divider"></div>
        </div>

        <div class="storage-facts">
          <h3>Local Storage Facts</h3>
          <div class="fact-row">
            <span>Your Stations</span>
            <span class="checkmark">✓</span>
          </div>
          <div class="fact-row">
            <span>Username</span>
            <span class="checkmark">✓</span>
          </div>
          <div class="fact-row">
            <span>Settings</span>
            <span class="checkmark">✓</span>
          </div>
          <div class="divider"></div>
        </div>

        <div class="external-services">
          <h3>External Services</h3>
          <div class="service">
            <strong>Radio Browser API</strong>
            <p>Used only to fetch station data</p>
          </div>
          <div class="service">
            <strong>URL Shortener</strong>
            <p>Used only when sharing stations</p>
          </div>
          <div class="divider"></div>
        </div>

        <div class="user-rights">
          <h3>User Rights</h3>
          <ul>
            <li>All your data stays on your device</li>
            <li>No tracking or analytics</li>
            <li>No data sharing without your consent</li>
            <li>Export your data anytime</li>
            <li>Delete your data anytime</li>
          </ul>
          <div class="divider"></div>
        </div>

        <div class="disclaimer">
          <h3>Disclaimer</h3>
          <p>This app is provided "as is" without any warranties. We are not responsible for the content of radio stations or any issues with streaming.</p>
          <div class="divider"></div>
        </div>

        <div class="last-updated">
          <p><strong>Last updated: May 2025</strong></p>
        </div>
      </div>

    `;

    this.modalManager.open({
      type: 'terms',
      title: 'Not My First Radio',
      content: termsContent,
      size: 'medium'
    });
  }

  /**
   * Handle critical errors
   */
  private handleCriticalError(error: Error): void {
    console.error('[App] Critical error:', error);
    
    // Show error modal
    this.modalManager?.alert(
      'Application Error',
      'A critical error occurred. Please refresh the page to continue.',
      () => {
        window.location.reload();
      }
    );
  }

  /**
   * Get current application state
   */
  getState(): AppState {
    return { ...this.state };
  }

  /**
   * Get module instances (for debugging)
   */
  getModules() {
    return {
      radioPlayer: this.radioPlayer,
      stationManager: this.stationManager,
      notificationManager: this.notificationManager,
      modalManager: this.modalManager,
      settingsManager: this.settingsManager,
      userManager: this.userManager,
      achievementManager: this.achievementManager,
      achievementNotification: this.achievementNotification,
      achievementModal: this.achievementModal,
      navigation: this.navigation,
      libraryView: this.libraryView
    };
  }

  /**
   * Destroy the application and clean up resources
   */
  destroy(): void {
    if (this.isDestroyed) {
      return;
    }

    console.log('[App] Destroying application');

    // Destroy all modules
    this.radioPlayer?.destroy();
    this.stationManager?.destroy();
    this.notificationManager?.destroy();
    this.modalManager?.destroy();
    this.settingsManager?.destroy();
    this.userManager?.destroy();
    this.achievementManager?.destroy();
    this.achievementNotification?.destroy();
    this.achievementModal?.destroy();
    this.navigation?.destroy();
    this.libraryView?.destroy();
    this.settingsView?.destroy();
    
    // Destroy router
    router.destroy();

    // Clear all event listeners
    eventManager.removeAllListeners();

    this.isDestroyed = true;
    this.isInitialized = false;

    console.log('[App] Application destroyed');
  }
}