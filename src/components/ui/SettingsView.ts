/**
 * Settings view component for organized settings management
 */

import { AppSettings } from '@/types/app';
import { createElement, querySelector } from '@/utils/dom';
import { eventManager } from '@/utils/events';
import { getStorageItem, StorageKeys, clearAllStorage } from '@/utils/storage';

export interface SettingsViewConfig {
  container?: HTMLElement;
  showDataManagement?: boolean;
  showAchievements?: boolean;
}

export interface SettingSection {
  id: string;
  title: string;
  description?: string;
  icon: string;
  settings: SettingItem[];
}

export interface SettingItem {
  id: keyof AppSettings | string;
  label: string;
  description?: string;
  type: 'toggle' | 'slider' | 'select' | 'button' | 'info' | 'info-with-links';
  value?: any;
  options?: { value: any; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  action?: () => void;
}

/**
 * Settings view component that organizes settings into logical sections
 */
export class SettingsView {
  private container: HTMLElement;
  private config: SettingsViewConfig;
  private _settings!: AppSettings;
  private sections: SettingSection[] = [];

  constructor(config: SettingsViewConfig = {}) {
    this.config = {
      showDataManagement: true,
      showAchievements: true,
      ...config
    };

    this.container = config.container || this.createContainer();
    this.loadSettings();
    this.createSections();
    this.render();
    this.setupEventListeners();
  }

  /**
   * Create settings view container if one isn't provided
   */
  private createContainer(): HTMLElement {
    const container = createElement('div', {
      className: 'settings-view',
      id: 'settings-view'
    });

    // Find the settings panel and replace it
    const settingsPanel = querySelector('#settings-panel');
    if (settingsPanel.parentNode) {
      settingsPanel.parentNode.insertBefore(container, settingsPanel);
      settingsPanel.remove();
    } else {
      document.body.appendChild(container);
    }

    return container;
  }

  /**
   * Load current settings
   */
  private loadSettings(): void {
    this.settings = getStorageItem(StorageKeys.SETTINGS, {});
  }

  /**
   * Create settings sections configuration
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
        }
      ]
    });
  }

  /**
   * Render the complete settings view
   */
  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'settings-view';

    // Create settings header
    this.renderHeader();

    // Create settings content
    this.renderContent();
  }

  /**
   * Render settings header
   */
  private renderHeader(): void {
    const header = createElement('div', { className: 'settings-header' });

    const titleSection = createElement('div', { className: 'settings-title-section' });
    const title = createElement('h2', { className: 'settings-title' }, ['Settings']);
    
    titleSection.appendChild(title);

    header.appendChild(titleSection);
    this.container.appendChild(header);
  }

  /**
   * Render settings content sections
   */
  private renderContent(): void {
    const content = createElement('div', { className: 'settings-content' });

    this.sections.forEach(section => {
      const sectionElement = this.createSection(section);
      content.appendChild(sectionElement);
    });

    this.container.appendChild(content);
  }

  /**
   * Create a settings section
   */
  private createSection(section: SettingSection): HTMLElement {
    const sectionElement = createElement('div', { 
      className: 'settings-section',
      dataset: { sectionId: section.id }
    });

    // Section header
    const header = createElement('div', { className: 'settings-section-header' });
    const icon = createElement('span', { className: 'material-symbols-rounded' }, [section.icon]);
    const headerText = createElement('div', { className: 'settings-section-header-text' });
    const title = createElement('h3', { className: 'settings-section-title' }, [section.title]);
    
    headerText.appendChild(title);
    if (section.description) {
      const description = createElement('p', { className: 'settings-section-description' }, [
        section.description
      ]);
      headerText.appendChild(description);
    }

    header.appendChild(icon);
    header.appendChild(headerText);

    // Section content
    const sectionContent = createElement('div', { className: 'settings-section-content' });
    
    section.settings.forEach(setting => {
      const settingElement = this.createSetting(setting);
      sectionContent.appendChild(settingElement);
    });

    sectionElement.appendChild(header);
    sectionElement.appendChild(sectionContent);

    return sectionElement;
  }

  /**
   * Create a setting item
   */
  private createSetting(setting: SettingItem): HTMLElement {
    const settingElement = createElement('div', { 
      className: `settings-item settings-item-${setting.type}`,
      dataset: { settingId: setting.id as string }
    });

    // Check if we need to create settingInfo (only if there's a label or description to show)
    const hasLabel = setting.label && setting.label.trim() !== '';
    const hasDescription = setting.description && setting.type !== 'info-with-links';
    
    if (hasLabel || hasDescription) {
      const settingInfo = createElement('div', { className: 'settings-item-info' });
      
      if (hasLabel) {
        const label = createElement('label', { className: 'settings-item-label' }, [setting.label]);
        settingInfo.appendChild(label);
      }
      
      if (hasDescription) {
        const description = createElement('p', { className: 'settings-item-description' }, [
          setting.description!
        ]);
        settingInfo.appendChild(description);
      }
      
      settingElement.appendChild(settingInfo);
    }

    const settingControl = createElement('div', { className: 'settings-item-control' });

    // Create appropriate control based on type
    switch (setting.type) {
      case 'toggle':
        this.createToggleControl(settingControl, setting);
        break;
      case 'slider':
        this.createSliderControl(settingControl, setting);
        break;
      case 'select':
        this.createSelectControl(settingControl, setting);
        break;
      case 'button':
        this.createButtonControl(settingControl, setting);
        break;
      case 'info':
        this.createInfoControl(settingControl, setting);
        break;
      case 'info-with-links':
        this.createInfoWithLinksControl(settingControl, setting);
        break;
    }

    settingElement.appendChild(settingControl);

    return settingElement;
  }

  /**
   * Create toggle control
   */
  private createToggleControl(container: HTMLElement, setting: SettingItem): void {
    const toggle = createElement('label', { className: 'settings-toggle' });
    const input = createElement('input', {
      type: 'checkbox',
      checked: setting.value
    }) as HTMLInputElement;
    const slider = createElement('span', { className: 'settings-toggle-slider' });

    input.addEventListener('change', () => {
      this.updateSetting(setting.id as string, input.checked);
    });

    toggle.appendChild(input);
    toggle.appendChild(slider);
    container.appendChild(toggle);
  }

  /**
   * Create slider control
   */
  private createSliderControl(container: HTMLElement, setting: SettingItem): void {
    const sliderWrapper = createElement('div', { className: 'settings-slider-wrapper' });
    
    const slider = createElement('input', {
      type: 'range',
      className: 'settings-slider',
      min: setting.min?.toString() || '0',
      max: setting.max?.toString() || '100',
      step: setting.step?.toString() || '1',
      value: setting.value?.toString() || '0'
    }) as HTMLInputElement;

    const valueDisplay = createElement('span', { className: 'settings-slider-value' }, [
      setting.value?.toString() || '0'
    ]);

    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      this.updateSetting(setting.id as string, value);
      valueDisplay.textContent = value.toString();
    });

    sliderWrapper.appendChild(slider);
    sliderWrapper.appendChild(valueDisplay);
    container.appendChild(sliderWrapper);
  }

  /**
   * Create select control
   */
  private createSelectControl(container: HTMLElement, setting: SettingItem): void {
    const select = createElement('select', { className: 'settings-select' }) as HTMLSelectElement;
    
    setting.options?.forEach(option => {
      const optionElement = createElement('option', {
        value: option.value.toString(),
        selected: option.value === setting.value
      }, [option.label]);
      select.appendChild(optionElement);
    });

    select.addEventListener('change', () => {
      this.updateSetting(setting.id as string, select.value);
    });

    container.appendChild(select);
  }

  /**
   * Create button control
   */
  private createButtonControl(container: HTMLElement, setting: SettingItem): void {
    const button = createElement('button', { className: 'settings-button' }, [setting.label]);
    
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
  private createInfoControl(container: HTMLElement, setting: SettingItem): void {
    const info = createElement('span', { className: 'settings-info-value' }, [
      setting.description || setting.value?.toString() || ''
    ]);
    container.appendChild(info);
  }

  /**
   * Create info control with clickable links
   */
  private createInfoWithLinksControl(container: HTMLElement, setting: SettingItem): void {
    const infoText = setting.description || '';
    const info = createElement('span', { className: 'settings-info-value settings-info-with-links' });
    
    // Parse the text and create clickable links
    let processedText = infoText;
    
    // Replace "Miles Gilbert" with a clickable link
    processedText = processedText.replace(
      'Miles Gilbert',
      '<a href="#" data-link="https://www.milesgilbert.xyz" class="settings-link">Miles Gilbert</a>'
    );
    
    // Replace "Read more here" with a clickable link
    processedText = processedText.replace(
      'Read more here',
      '<a href="#" data-link="https://milesgilbert.xyz/thinking/a-certification-for-algorithm-free-platforms/" class="settings-link">Read more here</a>'
    );
    
    info.innerHTML = processedText;
    
    // Add click event listeners to the links
    info.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('settings-link')) {
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
   * Update a setting value
   */
  private updateSetting(key: string, value: any): void {
    // Settings are now always empty, but keeping method for potential future use
    eventManager.emit('settings:update', { [key]: value });
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
    // Listen for settings updates
    eventManager.on('settings:changed', (settings: AppSettings) => {
      this.settings = settings;
      this.updateSettingsDisplay();
    });

    // Listen for view changes
    eventManager.on('view:changed', (data: { currentView: string }) => {
      if (data.currentView === 'settings') {
        this.show();
      } else {
        this.hide();
      }
    });
  }

  /**
   * Update settings display with new values
   */
  private updateSettingsDisplay(): void {
    // No settings to update since AppSettings is now empty
    // This method is kept for potential future use
  }

  /**
   * Show the settings view
   */
  show(): void {
    // View visibility is controlled by body.view-settings class in CSS
  }

  /**
   * Hide the settings view
   */
  hide(): void {
    // View visibility is controlled by body class, nothing to do here
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
    eventManager.removeAllListeners('settings:changed');
    eventManager.removeAllListeners('view:changed');
    this.container.remove();
  }
}