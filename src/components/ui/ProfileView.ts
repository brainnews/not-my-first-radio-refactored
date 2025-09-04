/**
 * Profile view component for user profile and tools management
 */

import { createElement, querySelector } from '@/utils/dom';
import { eventManager } from '@/utils/events';
import { clearAllStorage } from '@/utils/storage';
import { STREAM_SCANNER_BOOKMARKLET } from '@/constants/bookmarklet';

export interface ProfileViewConfig {
  container?: HTMLElement;
  showDataManagement?: boolean;
  showAchievements?: boolean;
}

export interface ProfileSection {
  id: string;
  title: string;
  description?: string;
  icon: string;
  settings: ProfileItem[];
}

export interface ProfileItem {
  id: string;
  label: string;
  description?: string;
  type: 'button' | 'info' | 'info-with-links' | 'bookmarklet-widget';
  action?: () => void;
  bookmarkletData?: {
    name: string;
    code: string;
    instructions: {
      desktop: string;
      mobile: string;
      fallback: string;
    };
    usage: readonly string[];
  };
}

/**
 * Profile view component that organizes user profile and tools into logical sections
 */
export class ProfileView {
  private container: HTMLElement;
  private config: ProfileViewConfig;
  private sections: ProfileSection[] = [];
  private eventListeners: Array<{ event: string; handler: (payload: any) => void }> = [];

  constructor(config: ProfileViewConfig = {}) {
    this.config = {
      showDataManagement: true,
      showAchievements: true,
      ...config
    };

    this.container = config.container || this.createContainer();
    this.createSections();
    this.render();
    this.setupEventListeners();
  }

  /**
   * Create profile view container if one isn't provided
   */
  private createContainer(): HTMLElement {
    const container = createElement('div', {
      className: 'profile-view',
      id: 'profile-view'
    });

    // Find the profile panel and replace it
    const profilePanel = querySelector('#profile-panel');
    if (profilePanel.parentNode) {
      profilePanel.parentNode.insertBefore(container, profilePanel);
      profilePanel.remove();
    } else {
      document.body.appendChild(container);
    }

    return container;
  }


  /**
   * Create profile sections configuration
   */
  private createSections(): void {
    this.sections = [];

    // Add achievements section if enabled
    if (this.config.showAchievements) {
      this.sections.push({
        id: 'achievements',
        title: 'Achievements',
        description: 'Track your listening progress and milestones',
        icon: 'emoji_events',
        settings: [
          {
            id: 'viewAchievements',
            label: 'View achievements',
            description: 'See your progress and unlocked achievements',
            type: 'button',
            action: () => eventManager.emit('achievements:show-modal')
          },
          {
            id: 'resetAchievements',
            label: 'Reset achievements',
            description: 'Clear all achievement progress (cannot be undone)',
            type: 'button',
            action: () => this.resetAchievements()
          }
        ]
      });
    }


    // Add browser tools section
    this.sections.push({
      id: 'browser-tools',
      title: 'Browser Tools',
      description: 'Enhance your station discovery with browser tools',
      icon: 'extension',
      settings: [
        {
          id: 'streamScannerWidget',
          label: 'Stream Scanner',
          description: 'Automatically detect and import radio streams from their websites (beta)',
          type: 'bookmarklet-widget',
          bookmarkletData: STREAM_SCANNER_BOOKMARKLET
        }
      ]
    });

    // Add data management section if enabled
    if (this.config.showDataManagement) {
      this.sections.push({
        id: 'data',
        title: 'Data Management',
        description: 'Import, export, and manage your data',
        icon: 'storage',
        settings: [
          {
            id: 'exportData',
            label: 'Export all data',
            description: 'Download all your stations, settings, and achievements',
            type: 'button',
            action: () => this.exportData()
          },
          {
            id: 'importData',
            label: 'Import data',
            description: 'Restore data from a previously exported file',
            type: 'button',
            action: () => this.importData()
          },
          {
            id: 'clearData',
            label: 'Clear all data',
            description: 'Delete all your data and reset the app (cannot be undone)',
            type: 'button',
            action: () => this.clearAllData()
          }
        ]
      });
    }

    // Add app info section
    this.sections.push({
      id: 'about',
      title: 'About',
      description: 'App information and support',
      icon: 'info',
      settings: [
        {
          id: 'about-text',
          label: '',
          description: 'Not My First Radio is developed by Miles Gilbert as part of a series of non-algorithmically driven discovery apps. Read more here.',
          type: 'info-with-links'
        },
        {
          id: 'privacy-info',
          label: '',
          description: 'Privacy: All your data stays on your device. The app connects to the Radio Browser API for station discovery and an optional sharing service when you choose to share stations. No tracking or personal data collection.',
          type: 'info-with-links'
        }
      ]
    });
  }

  /**
   * Render the complete profile view
   */
  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'profile-view';

    // Create profile header
    this.renderHeader();

    // Create profile content
    this.renderContent();
  }

  /**
   * Render profile header
   */
  private renderHeader(): void {
    const header = createElement('div', { className: 'profile-header' });
    const title = createElement('h2', { className: 'profile-title' }, ['Profile']);
    
    header.appendChild(title);
    this.container.appendChild(header);
  }

  /**
   * Render profile content sections
   */
  private renderContent(): void {
    const content = createElement('div', { className: 'profile-content' });

    this.sections.forEach(section => {
      const sectionElement = this.createSection(section);
      content.appendChild(sectionElement);
    });

    this.container.appendChild(content);
  }

  /**
   * Create a profile section
   */
  private createSection(section: ProfileSection): HTMLElement {
    const sectionElement = createElement('div', { 
      className: 'profile-section',
      dataset: { sectionId: section.id }
    });

    // Section header
    const header = createElement('div', { className: 'profile-section-header' });
    const icon = createElement('span', { className: 'material-symbols-rounded' }, [section.icon]);
    const headerText = createElement('div', { className: 'profile-section-header-text' });
    const title = createElement('h3', { className: 'profile-section-title' }, [section.title]);
    
    headerText.appendChild(title);
    if (section.description) {
      const description = createElement('p', { className: 'profile-section-description' }, [
        section.description
      ]);
      headerText.appendChild(description);
    }

    header.appendChild(icon);
    header.appendChild(headerText);

    // Section content
    const sectionContent = createElement('div', { className: 'profile-section-content' });
    
    section.settings.forEach(setting => {
      const settingElement = this.createSetting(setting);
      sectionContent.appendChild(settingElement);
    });

    sectionElement.appendChild(header);
    sectionElement.appendChild(sectionContent);

    return sectionElement;
  }

  /**
   * Create a profile item
   */
  private createSetting(setting: ProfileItem): HTMLElement {
    const settingElement = createElement('div', { 
      className: `profile-item profile-item-${setting.type}`,
      dataset: { settingId: setting.id as string }
    });

    // Check if we need to create settingInfo (only if there's a label or description to show)
    const hasLabel = setting.label && setting.label.trim() !== '';
    const hasDescription = setting.description && setting.type !== 'info-with-links';
    
    if (hasLabel || hasDescription) {
      const settingInfo = createElement('div', { className: 'profile-item-info' });
      
      if (hasLabel) {
        const label = createElement('label', { className: 'profile-item-label' }, [setting.label]);
        settingInfo.appendChild(label);
      }
      
      if (hasDescription) {
        const description = createElement('p', { className: 'profile-item-description' }, [
          setting.description!
        ]);
        settingInfo.appendChild(description);
      }
      
      settingElement.appendChild(settingInfo);
    }

    const settingControl = createElement('div', { className: 'profile-item-control' });

    // Create appropriate control based on type
    switch (setting.type) {
      case 'button':
        this.createButtonControl(settingControl, setting);
        break;
      case 'info':
        this.createInfoControl(settingControl, setting);
        break;
      case 'info-with-links':
        this.createInfoWithLinksControl(settingControl, setting);
        break;
      case 'bookmarklet-widget':
        this.createBookmarkletWidgetControl(settingControl, setting);
        break;
    }

    settingElement.appendChild(settingControl);

    return settingElement;
  }


  /**
   * Create button control
   */
  private createButtonControl(container: HTMLElement, setting: ProfileItem): void {
    const button = createElement('button', { className: 'profile-button' }, [setting.label]);
    
    button.addEventListener('click', () => {
      if (setting.action) {
        setting.action();
      }
    });

    container.appendChild(button);
  }

  /**
   * Create info control
   */
  private createInfoControl(container: HTMLElement, setting: ProfileItem): void {
    const info = createElement('span', { className: 'profile-info-value' }, [
      setting.description || ''
    ]);
    container.appendChild(info);
  }

  /**
   * Create bookmarklet widget control
   */
  private createBookmarkletWidgetControl(container: HTMLElement, setting: ProfileItem): void {
    if (!setting.bookmarkletData) return;

    const data = setting.bookmarkletData;
    const widget = createElement('div', { className: 'bookmarklet-widget' });

    // Bookmarklet section
    const bookmarkletSection = createElement('div', { className: 'bookmarklet-section' });
    
    const dragInstruction = createElement('p', { className: 'bookmarklet-instruction' }, [
      'Drag this link to your bookmarks bar:'
    ]);
    bookmarkletSection.appendChild(dragInstruction);

    const bookmarkletLink = createElement('a', {
      href: data.code,
      className: 'bookmarklet-link',
      draggable: true
    }, [data.name]);
    bookmarkletSection.appendChild(bookmarkletLink);

    // const fallbackText = createElement('p', { className: 'bookmarklet-fallback' }, [
    //   data.instructions.fallback
    // ]);
    // bookmarkletSection.appendChild(fallbackText);

    widget.appendChild(bookmarkletSection);

    // // Usage instructions
    // const usageSection = createElement('div', { className: 'bookmarklet-usage' });
    // const usageTitle = createElement('h5', {}, ['How to use:']);
    // usageSection.appendChild(usageTitle);

    // const usageList = createElement('ol', { className: 'usage-list' });
    // data.usage.forEach(step => {
    //   const listItem = createElement('li', {}, [step]);
    //   usageList.appendChild(listItem);
    // });
    // usageSection.appendChild(usageList);

    // widget.appendChild(usageSection);
    container.appendChild(widget);
  }

  /**
   * Create info control with clickable links
   */
  private createInfoWithLinksControl(container: HTMLElement, setting: ProfileItem): void {
    const infoText = setting.description || '';
    const info = createElement('span', { className: 'profile-info-value profile-info-with-links' });
    
    // Link patterns for replacement
    const linkPatterns = [
      {
        text: 'Miles Gilbert',
        url: 'https://www.milesgilbert.xyz'
      },
      {
        text: 'Read more here',
        url: 'https://milesgilbert.xyz/thinking/a-certification-for-algorithm-free-platforms/'
      }
    ];
    
    // Replace text patterns with clickable links
    let processedText = infoText;
    linkPatterns.forEach(({ text, url }) => {
      processedText = processedText.replace(
        text,
        `<a href="#" data-link="${url}" class="profile-link">${text}</a>`
      );
    });
    
    info.innerHTML = processedText;
    
    // Add click event listeners to the links
    info.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('profile-link')) {
        e.preventDefault();
        const link = target.getAttribute('data-link');
        if (link) {
          window.open(link, '_blank');
        }
      }
    });
    
    container.appendChild(info);
  }


  /**
   * Export all data
   */
  private async exportData(): Promise<void> {
    // Use the same approach as Library export to avoid double-stringification
    eventManager.emit('stations:export-json');
  }

  /**
   * Import data from file
   */
  private importData(): void {
    const input = createElement('input', {
      type: 'file',
      accept: '.json'
    }) as HTMLInputElement;
    input.style.display = 'none';

    input.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        
        // Validate JSON format
        JSON.parse(text); // This will throw if invalid JSON
        
        // Emit the raw JSON content to trigger the import options modal
        eventManager.emit('data:import-modal', text);
        
      } catch (error) {
        console.error('[SettingsView] Import error:', error);
        eventManager.emit('notification:show', {
          type: 'error',
          message: 'Failed to import data. Please check the file format.'
        });
      }
    });

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }

  /**
   * Clear all data
   */
  private clearAllData(): void {
    eventManager.emit('modal:open', {
      type: 'confirmation',
      title: 'Clear All Data',
      content: 'This will permanently delete all your stations, settings, and achievements. This action cannot be undone.',
      actions: [
        {
          label: 'Cancel',
          style: 'secondary',
          action: () => eventManager.emit('modal:close')
        },
        {
          label: 'Clear Everything',
          style: 'danger',
          action: () => {
            clearAllStorage();
            eventManager.emit('notification:show', {
              type: 'success',
              message: 'All data cleared successfully'
            });
            eventManager.emit('modal:close');
            setTimeout(() => window.location.reload(), 1000);
          }
        }
      ]
    });
  }

  /**
   * Reset achievements
   */
  private resetAchievements(): void {
    eventManager.emit('modal:open', {
      type: 'confirmation',
      title: 'Reset Achievements',
      content: 'This will clear all your achievement progress. This action cannot be undone.',
      actions: [
        {
          label: 'Cancel',
          style: 'secondary',
          action: () => eventManager.emit('modal:close')
        },
        {
          label: 'Reset Achievements',
          style: 'danger',
          action: () => {
            eventManager.emit('achievements:reset');
            eventManager.emit('notification:show', {
              type: 'success',
              message: 'Achievements reset successfully'
            });
            eventManager.emit('modal:close');
          }
        }
      ]
    });
  }


  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    const viewChangeHandler = (data: { currentView: string }): void => {
      if (data.currentView === 'profile') {
        this.show();
      } else {
        this.hide();
      }
    };

    eventManager.on('view:changed', viewChangeHandler);
    this.eventListeners.push({ event: 'view:changed', handler: viewChangeHandler });
  }


  /**
   * Show the profile view
   */
  show(): void {
    this.container.style.display = 'block';
  }

  /**
   * Hide the profile view
   */
  hide(): void {
    this.container.style.display = 'none';
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
    this.eventListeners.forEach(({ event, handler }) => {
      eventManager.off(event as any, handler as any);
    });
    this.eventListeners = [];
    this.container.remove();
  }
}