/**
 * Navigation component for three-view app structure
 */

import { createElement } from '@/utils/dom';
import { eventManager } from '@/utils/events';
import { addRippleEffect } from '@/utils/animations';
import { router } from '@/router/Router';

export interface NavigationConfig {
  container?: HTMLElement;
  type?: 'tab-bar' | 'side-nav';
  position?: 'bottom' | 'top' | 'left' | 'right';
}

interface NavigationItem {
  id: string;
  label: string;
  icon: string;
  view: 'library' | 'settings' | 'search';
  active?: boolean;
}

/**
 * Navigation component for switching between app views
 */
export class Navigation {
  private container: HTMLElement;
  private config: NavigationConfig;
  private currentView: 'library' | 'settings' | 'search';
  private navigationItems: NavigationItem[] = [
    {
      id: 'nav-library',
      label: 'Library',
      icon: 'library_music',
      view: 'library',
      active: true
    },
    {
      id: 'nav-search',
      label: 'Explore',
      icon: 'search',
      view: 'search'
    },
    {
      id: 'nav-settings',
      label: 'Settings',
      icon: 'settings',
      view: 'settings'
    }
  ];

  constructor(config: NavigationConfig = {}) {
    this.config = {
      type: 'tab-bar',
      position: 'top',
      ...config
    };

    // Initialize current view from router if available, otherwise default to library
    this.currentView = router.getCurrentView() || 'library';
    this.container = config.container || this.createContainer();

    this.render();
    this.setupEventListeners();
  }

  /**
   * Create navigation container if one isn't provided
   */
  private createContainer(): HTMLElement {
    const container = createElement('nav', {
      className: `navigation navigation-${this.config.type}`,
      id: 'app-navigation'
    });

    // Add to body based on position
    document.body.appendChild(container);
    return container;
  }

  /**
   * Render the navigation UI
   */
  private render(): void {
    // Clear existing content
    this.container.innerHTML = '';
    this.container.className = `navigation navigation-${this.config.type} navigation-${this.config.position}`;

    if (this.config.type === 'tab-bar') {
      this.renderTabBar();
    } else {
      this.renderSideNav();
    }
  }

  /**
   * Render tab bar navigation (mobile-friendly)
   */
  private renderTabBar(): void {
    const tabBar = createElement('div', { className: 'tab-bar' });

    this.navigationItems.forEach(item => {
      const tab = createElement('button', {
        className: `tab-item ${item.active ? 'active' : ''}`,
        dataset: { view: item.view },
        title: item.label
      });

      const icon = createElement('span', {
        className: 'material-symbols-rounded'
      }, [item.icon]);

      const label = createElement('span', {
        className: 'tab-label'
      }, [item.label]);

      tab.appendChild(icon);
      tab.appendChild(label);
      
      tab.addEventListener('click', (e) => {
        addRippleEffect(tab, e as MouseEvent);
        this.switchToView(item.view);
      });

      tabBar.appendChild(tab);
    });

    this.container.appendChild(tabBar);
  }

  /**
   * Render side navigation (desktop-friendly)
   */
  private renderSideNav(): void {
    const sideNav = createElement('div', { className: 'side-nav' });

    // App logo/title
    const header = createElement('div', { className: 'nav-header' });
    const logo = createElement('div', { className: 'nav-logo' }, ['NMFR']);
    header.appendChild(logo);
    sideNav.appendChild(header);

    // Navigation items
    const navList = createElement('ul', { className: 'nav-list' });

    this.navigationItems.forEach(item => {
      const listItem = createElement('li', { className: 'nav-list-item' });
      
      const navLink = createElement('button', {
        className: `nav-link ${item.active ? 'active' : ''}`,
        dataset: { view: item.view }
      });

      const icon = createElement('span', {
        className: 'material-symbols-rounded nav-icon'
      }, [item.icon]);

      const label = createElement('span', {
        className: 'nav-label'
      }, [item.label]);

      navLink.appendChild(icon);
      navLink.appendChild(label);
      
      navLink.addEventListener('click', (e) => {
        addRippleEffect(navLink, e as MouseEvent);
        this.switchToView(item.view);
      });

      listItem.appendChild(navLink);
      navList.appendChild(listItem);
    });

    sideNav.appendChild(navList);
    this.container.appendChild(sideNav);
  }

  /**
   * Switch to a specific view
   */
  private switchToView(view: 'library' | 'settings' | 'search'): void {
    if (view === this.currentView) return;

    // Use router to navigate, which will handle URL updates and emit events
    router.navigateToView(view);
  }

  /**
   * Update active state for navigation items
   */
  private updateActiveState(activeView: 'library' | 'settings' | 'search'): void {
    // Update internal navigation items
    this.navigationItems.forEach(item => {
      item.active = item.view === activeView;
    });

    // Update DOM elements
    const navItems = this.container.querySelectorAll('[data-view]');
    navItems.forEach(item => {
      const itemView = item.getAttribute('data-view');
      if (itemView === activeView) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen for view changes from router
    eventManager.on('view:changed', (data: { currentView: string }) => {
      this.currentView = data.currentView as 'library' | 'settings' | 'search';
      this.updateActiveState(this.currentView);
    });

    // Also listen for direct view:change events to keep UI in sync
    eventManager.on('view:change', (view: 'library' | 'settings' | 'search') => {
      this.currentView = view;
      this.updateActiveState(view);
    });

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      // Don't handle shortcuts when typing in inputs
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Number keys 1-3 for quick view switching
      if (event.key >= '1' && event.key <= '3') {
        const viewIndex = parseInt(event.key) - 1;
        const targetView = this.navigationItems[viewIndex]?.view;
        if (targetView) {
          event.preventDefault();
          this.switchToView(targetView);
        }
      }
    });
  }

  /**
   * Update navigation type (e.g., switch between tab-bar and side-nav)
   */
  updateType(type: 'tab-bar' | 'side-nav'): void {
    this.config.type = type;
    this.render();
  }

  /**
   * Update navigation position
   */
  updatePosition(position: 'bottom' | 'top' | 'left' | 'right'): void {
    this.config.position = position;
    this.container.className = `navigation navigation-${this.config.type} navigation-${this.config.position}`;
  }

  /**
   * Get current view
   */
  getCurrentView(): 'library' | 'settings' | 'search' {
    return this.currentView;
  }

  /**
   * Show navigation
   */
  show(): void {
    this.container.classList.remove('hidden');
  }

  /**
   * Hide navigation
   */
  hide(): void {
    this.container.classList.add('hidden');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    eventManager.removeAllListeners('view:changed');
    eventManager.removeAllListeners('view:change');
    this.container.remove();
  }
}