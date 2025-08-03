/**
 * Library view component for displaying user's saved stations and collections
 */

import { LocalStation } from '@/types/station';
import { createElement, querySelector } from '@/utils/dom';
import { eventManager } from '@/utils/events';
import { getStorageItem, StorageKeys } from '@/utils/storage';
import { getAnimatedEqualizerIcon, getBitrateIcon } from '@/utils/icons';

export interface LibraryViewConfig {
  container?: HTMLElement;
  showWelcome?: boolean;
}

/**
 * Library view component that organizes and displays the user's station collection
 */
export class LibraryView {
  private container: HTMLElement;
  private stations: LocalStation[] = [];
  private currentPlayingStation: LocalStation | null = null;
  private isCurrentlyPlaying: boolean = false;

  constructor(config: LibraryViewConfig = {}) {

    this.container = config.container || this.createContainer();
    this.loadStations();
    this.render();
    this.setupEventListeners();
  }

  /**
   * Create library view container if one isn't provided
   */
  private createContainer(): HTMLElement {
    const container = createElement('div', {
      className: 'library-view',
      id: 'library-view'
    });

    // Find the saved stations section and replace it
    const savedStationsSection = querySelector('#saved-stations');
    if (savedStationsSection.parentNode) {
      savedStationsSection.parentNode.insertBefore(container, savedStationsSection);
      savedStationsSection.remove();
    } else {
      document.body.appendChild(container);
    }

    return container;
  }

  /**
   * Load stations from storage
   */
  private loadStations(): void {
    this.stations = getStorageItem(StorageKeys.STATIONS, []);
  }

  /**
   * Render the library view
   */
  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'library-view';

    // Always render header if there are stations (or if we're adding one)
    // This ensures the header doesn't disappear during station addition
    if (this.stations.length > 0) {
      this.renderHeader();
    }

    // Create main library content
    this.renderContent();
  }

  /**
   * Render library header with actions
   */
  private renderHeader(): void {
    const header = createElement('div', { className: 'library-header' });

    // Title section with share button
    const titleSection = createElement('div', { className: 'library-title-section' });
    const title = createElement('h2', { className: 'library-title' }, ['Your Library']);
    
    // More options button (includes share and import)
    const moreButton = createElement('button', {
      className: 'library-action-btn',
      title: 'More options'
    });
    moreButton.innerHTML = '<span class="material-symbols-rounded">more_vert</span>';
    moreButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showLibraryMenu(moreButton);
    });
    
    titleSection.appendChild(title);
    titleSection.appendChild(moreButton);

    header.appendChild(titleSection);

    this.container.appendChild(header);
  }


  /**
   * Render main library content
   */
  private renderContent(): void {
    const content = createElement('div', { className: 'library-content' });

    if (this.stations.length === 0) {
      this.renderEmptyState(content);
    } else {
      this.renderStationsContent(content);
    }

    this.container.appendChild(content);
  }

  /**
   * Render empty state when no stations are saved
   */
  private renderEmptyState(container: HTMLElement): void {
    const emptyState = createElement('div', { className: 'library-empty-state' });

    const icon = createElement('div', { className: 'library-empty-icon' });
    icon.innerHTML = getBitrateIcon({ size: 48 });

    const description = createElement('p', { className: 'library-empty-description' }, [
      'Not My First Radio is a lightweight, private, and local first radio player. Use natural language to search over 30,000 stations or start listening right away with a curated starter pack. No account required.'
    ]);

    const actions = createElement('div', { className: 'library-empty-actions' });

    // Search for stations button
    const searchButton = createElement('button', { className: 'library-empty-btn library-empty-btn-primary' }, [
      'Get started'
    ]);
    searchButton.addEventListener('click', () => {
      eventManager.emit('view:search');
    });

    actions.appendChild(searchButton);

    emptyState.appendChild(icon);
    emptyState.appendChild(description);
    emptyState.appendChild(actions);

    container.appendChild(emptyState);
  }

  /**
   * Render stations content with sections
   */
  private renderStationsContent(container: HTMLElement): void {
    // Quick access section (favorites, recent, etc.)
    this.renderQuickAccess(container);

    // All stations section
    this.renderAllStations(container);
  }

  /**
   * Render quick access section
   */
  private renderQuickAccess(container: HTMLElement): void {
    const quickAccess = createElement('div', { className: 'library-quick-access' });

    // Render presets using StationManager for full functionality
    this.renderPresets(quickAccess);

    // Always append quickAccess since presets section should always be shown
    container.appendChild(quickAccess);
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
   * Show library options menu with all actions at top level
   */
  private showLibraryMenu(anchorElement: HTMLElement): void {
    // Remove any existing menu
    const existingMenu = document.querySelector('.library-options-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // Check if mobile
    const isMobile = window.innerWidth <= 768;

    // Create menu container
    const menu = createElement('div', { 
      className: `library-options-menu library-station-menu ${isMobile ? 'mobile-sharesheet' : ''}` 
    });
    const menuList = createElement('div', { className: 'library-station-menu-list' });

    // Share with Link option
    const shareLinkItem = createElement('div', { className: 'library-station-menu-item' });
    const shareLinkIcon = createElement('span', { className: 'material-symbols-rounded' }, ['link']);
    const shareLinkLabel = createElement('span', {}, ['Share with Link']);
    shareLinkItem.appendChild(shareLinkIcon);
    shareLinkItem.appendChild(shareLinkLabel);
    shareLinkItem.addEventListener('click', () => {
      eventManager.emit('stations:share-url');
      menu.remove();
    });
    menuList.appendChild(shareLinkItem);

    // Share with QR Code option
    const shareQrItem = createElement('div', { className: 'library-station-menu-item' });
    const shareQrIcon = createElement('span', { className: 'material-symbols-rounded' }, ['qr_code']);
    const shareQrLabel = createElement('span', {}, ['Share with QR Code']);
    shareQrItem.appendChild(shareQrIcon);
    shareQrItem.appendChild(shareQrLabel);
    shareQrItem.addEventListener('click', () => {
      eventManager.emit('stations:share-qr');
      menu.remove();
    });
    menuList.appendChild(shareQrItem);

    // Export as JSON option
    const exportItem = createElement('div', { className: 'library-station-menu-item' });
    const exportIcon = createElement('span', { className: 'material-symbols-rounded' }, ['download']);
    const exportLabel = createElement('span', {}, ['Export as JSON']);
    exportItem.appendChild(exportIcon);
    exportItem.appendChild(exportLabel);
    exportItem.addEventListener('click', () => {
      eventManager.emit('stations:export-json');
      menu.remove();
    });
    menuList.appendChild(exportItem);

    // Import from JSON option
    const importItem = createElement('div', { className: 'library-station-menu-item' });
    const importIcon = createElement('span', { className: 'material-symbols-rounded' }, ['upload']);
    const importLabel = createElement('span', {}, ['Import from JSON']);
    importItem.appendChild(importIcon);
    importItem.appendChild(importLabel);
    importItem.addEventListener('click', () => {
      this.showImportDialog();
      menu.remove();
    });
    menuList.appendChild(importItem);

    // Add Station option
    const addStationItem = createElement('div', { className: 'library-station-menu-item' });
    const addStationIcon = createElement('span', { className: 'material-symbols-rounded' }, ['add']);
    const addStationLabel = createElement('span', {}, ['Add Station']);
    addStationItem.appendChild(addStationIcon);
    addStationItem.appendChild(addStationLabel);
    addStationItem.addEventListener('click', () => {
      eventManager.emit('modal:add-station');
      menu.remove();
    });
    menuList.appendChild(addStationItem);

    menu.appendChild(menuList);

    // Position menu based on device type
    document.body.appendChild(menu);

    if (isMobile) {
      // Mobile: Create overlay and show as bottom sheet
      const overlay = createElement('div', { className: 'library-menu-overlay' });
      document.body.appendChild(overlay);
      
      // Set mobile positioning
      menu.style.position = 'fixed';
      menu.style.bottom = '0';
      menu.style.left = '0';
      menu.style.right = '0';
      menu.style.transform = 'translateY(100%)';
      menu.style.zIndex = '1000';
      
      // Animate in
      requestAnimationFrame(() => {
        menu.style.transform = 'translateY(0)';
        overlay.style.opacity = '1';
      });

      // Close handler for mobile
      const closeMobileMenu = (e: Event) => {
        if (e.target === overlay || (!menu.contains(e.target as Node) && e.target !== anchorElement)) {
          menu.style.transform = 'translateY(100%)';
          overlay.style.opacity = '0';
          setTimeout(() => {
            menu.remove();
            overlay.remove();
            document.removeEventListener('click', closeMobileMenu);
          }, 200);
        }
      };
      setTimeout(() => document.addEventListener('click', closeMobileMenu), 0);
    } else {
      // Desktop: Position near anchor element
      const anchorRect = anchorElement.getBoundingClientRect();
      menu.style.position = 'absolute';
      menu.style.top = `${anchorRect.bottom + window.scrollY + 8}px`;
      menu.style.left = `${anchorRect.left + window.scrollX}px`;

      // Close menu when clicking outside (desktop)
      const closeMenu = (e: Event) => {
        if (!menu.contains(e.target as Node)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      };
      setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }
  }

  /**
   * Show import dialog for JSON files
   */
  private showImportDialog(): void {
    // Create hidden file input
    const fileInput = createElement('input', {
      type: 'file',
      accept: '.json'
    }) as HTMLInputElement;
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (event: Event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          this.importStationsFromJSON(content);
        };
        reader.readAsText(file);
      }
    });

    // Append to body and trigger click
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
  }

  /**
   * Import stations from JSON content
   */
  private importStationsFromJSON(jsonContent: string): void {
    // Validate JSON before emitting event
    try {
      JSON.parse(jsonContent);
      // Emit event to App.ts to show the import modal with merge/overwrite options
      eventManager.emit('data:import-modal', jsonContent);
    } catch (error) {
      console.error('Failed to import stations:', error);
      eventManager.emit('notification:show', {
        type: 'error',
        message: 'Failed to import stations. Please check the file format.'
      });
    }
  }


  /**
   * Render all stations section - delegates to StationManager for sorting/filtering
   */
  private renderAllStations(container: HTMLElement): void {
    const allStationsSection = createElement('div', { className: 'library-all-stations' });

    // Create stations container for StationManager to render into
    // Use unique ID to avoid conflicts with legacy HTML
    const stationsContainer = createElement('div', { 
      className: 'library-stations-container',
      id: 'library-stations-container'
    });

    allStationsSection.appendChild(stationsContainer);
    container.appendChild(allStationsSection);

    // Use setTimeout to ensure DOM is ready before triggering StationManager
    setTimeout(() => {
      this.triggerStationManagerRender();
    }, 0);
  }



  /**
   * Render presets section - delegates to StationManager for full preset functionality
   */
  private renderPresets(container: HTMLElement): void {
    const presetsSection = createElement('div', { className: 'library-presets' });

    // Create presets container for StationManager to render into
    // Use unique ID to avoid conflicts with legacy HTML
    const presetsContainer = createElement('div', { 
      className: 'library-presets-container',
      id: 'library-presets-container'
    });

    presetsSection.appendChild(presetsContainer);
    container.appendChild(presetsSection);

    // Use setTimeout to ensure DOM is ready before triggering StationManager
    setTimeout(() => {
      this.triggerPresetManagerRender();
    }, 0);
  }

  /**
   * Trigger StationManager to render stations with sorting/filtering
   */
  private triggerStationManagerRender(): void {
    // Emit event to tell StationManager to render into our container
    eventManager.emit('library:render-stations', {
      containerId: 'library-stations-container'
    });
  }

  /**
   * Trigger StationManager to render presets with full functionality
   */
  private triggerPresetManagerRender(): void {
    // Emit event to tell StationManager to render presets into our container
    eventManager.emit('library:render-presets', {
      containerId: 'library-presets-container'
    });
  }

  /**
   * Handle station data changes and refresh view
   */
  private handleStationChange = (stations?: LocalStation[]): void => {
    if (stations) {
      this.stations = stations;
    } else {
      this.loadStations();
    }
    
    // For station:added events, ensure we have the latest data
    // Use setTimeout to allow storage operations to complete
    setTimeout(() => {
      this.loadStations();
      this.render();
    }, 0);
  };

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for station changes
    eventManager.on('stations:loaded', this.handleStationChange);
    eventManager.on('station:added', this.handleStationChange);
    eventManager.on('station:removed', this.handleStationChange);
    eventManager.on('station:updated', this.handleStationChange);
    eventManager.on('stations:imported', this.handleStationChange);


    // Listen for player state changes to update currently playing station UI
    eventManager.on('station:selected', (station: LocalStation) => {
      this.currentPlayingStation = station;
      this.updatePlayingStationUI();
    });

    eventManager.on('station:play', (station: LocalStation) => {
      this.currentPlayingStation = station;
      this.isCurrentlyPlaying = true;
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
  }

  /**
   * Update UI for currently playing station
   */
  private updatePlayingStationUI(): void {
    // Update all quick station cards
    const allCards = this.container.querySelectorAll('.library-quick-station-card');
    
    allCards.forEach((cardElement) => {
      const card = cardElement as HTMLElement;
      const stationId = card.dataset.stationId;
      const station = this.stations.find(s => s.id === stationId);
      
      if (station) {
        const isCurrentlyPlaying = this.isStationCurrentlyPlaying(station);
        const nameContainer = card.querySelector('.station-name-container');
        
        // Update card class
        if (isCurrentlyPlaying && this.isCurrentlyPlaying) {
          card.classList.add('playing');
          
          // Add equalizer icon if not present
          if (nameContainer && !nameContainer.querySelector('.now-playing-icon')) {
            const equalizerIcon = createElement('div', { 
              className: 'now-playing-icon',
              title: 'Now playing'
            });
            equalizerIcon.innerHTML = getAnimatedEqualizerIcon({ size: 16 });
            nameContainer.appendChild(equalizerIcon);
          }
        } else {
          card.classList.remove('playing');
          
          // Remove equalizer icon if present
          const existingIcon = nameContainer?.querySelector('.now-playing-icon');
          if (existingIcon) {
            existingIcon.remove();
          }
        }
      }
    });
  }


  /**
   * Update view when stations change
   */
  refresh(): void {
    this.loadStations();
    this.render();
  }


  /**
   * Show the library view (visibility controlled by CSS)
   */
  show(): void {
    // View visibility is controlled by body.view-library class in CSS
  }

  /**
   * Hide the library view (visibility controlled by CSS)
   */
  hide(): void {
    // View visibility is controlled by body class in CSS
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
    // Remove specific listeners to avoid affecting other components
    eventManager.off('stations:loaded', this.handleStationChange);
    eventManager.off('station:added', this.handleStationChange);
    eventManager.off('station:removed', this.handleStationChange);
    eventManager.off('station:updated', this.handleStationChange);
    eventManager.off('stations:imported', this.handleStationChange);
    
    // Remove player state listeners (these use anonymous functions, so we'll need to keep them as removeAllListeners)
    eventManager.removeAllListeners('station:selected');
    eventManager.removeAllListeners('station:play');
    eventManager.removeAllListeners('station:pause');
    eventManager.removeAllListeners('station:stop');
    
    this.container.remove();
  }
}