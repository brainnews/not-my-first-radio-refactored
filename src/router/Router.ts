/**
 * Lightweight client-side router for view navigation
 */

import { eventManager } from '@/utils/events';

export interface Route {
  path: string;
  view: 'library' | 'settings' | 'search';
  name: string;
}

export interface RouterConfig {
  basePath?: string;
  mode?: 'history' | 'hash';
}

/**
 * Simple client-side router that coordinates with existing view system
 */
export class Router {
  private routes: Route[] = [];
  private currentRoute: Route | null = null;
  private config: RouterConfig;
  private isInitialized = false;

  constructor(config: RouterConfig = {}) {
    this.config = {
      basePath: '',
      mode: 'history',
      ...config
    };

    this.setupRoutes();
    this.bindEvents();
  }

  /**
   * Define application routes
   */
  private setupRoutes(): void {
    this.routes = [
      {
        path: '/',
        view: 'library',
        name: 'Library'
      },
      {
        path: '/search',
        view: 'search',
        name: 'Search'
      },
      {
        path: '/settings',
        view: 'settings', 
        name: 'Settings'
      }
    ];
  }

  /**
   * Initialize router and set up event listeners
   */
  init(): void {
    if (this.isInitialized) return;

    // Handle initial route
    this.handleInitialRoute();
    
    this.isInitialized = true;
    console.log('[Router] Initialized with current route:', this.currentRoute?.path);
  }

  /**
   * Bind browser events
   */
  private bindEvents(): void {
    // Handle browser back/forward navigation
    window.addEventListener('popstate', () => {
      const path = this.getCurrentPath();
      const route = this.findRouteByPath(path);
      
      if (route && route !== this.currentRoute) {
        this.navigateToRoute(route, false); // Don't push to history on popstate
      }
    });
  }

  /**
   * Handle the initial route when the app loads
   */
  private handleInitialRoute(): void {
    const currentPath = this.getCurrentPath();
    const route = this.findRouteByPath(currentPath);
    
    if (route) {
      this.currentRoute = route;
      // Emit initial view change without history manipulation
      eventManager.emit('view:change', route.view);
    } else {
      // Fallback to library view for unknown routes
      this.navigate('/', true);
    }
  }

  /**
   * Get current path from URL
   */
  private getCurrentPath(): string {
    if (this.config.mode === 'hash') {
      return window.location.hash.slice(1) || '/';
    }
    
    let path = window.location.pathname;
    
    // Remove base path if configured
    if (this.config.basePath) {
      path = path.replace(new RegExp(`^${this.config.basePath}`), '');
    }
    
    return path || '/';
  }

  /**
   * Find route by path
   */
  private findRouteByPath(path: string): Route | null {
    return this.routes.find(route => route.path === path) || null;
  }

  /**
   * Find route by view
   */
  private findRouteByView(view: 'library' | 'settings' | 'search'): Route | null {
    return this.routes.find(route => route.view === view) || null;
  }

  /**
   * Navigate to a specific path
   */
  navigate(path: string, pushState: boolean = true): void {
    const route = this.findRouteByPath(path);
    
    if (!route) {
      console.warn(`[Router] Route not found: ${path}`);
      return;
    }

    this.navigateToRoute(route, pushState);
  }

  /**
   * Navigate to a specific view
   */
  navigateToView(view: 'library' | 'settings' | 'search', pushState: boolean = true): void {
    const route = this.findRouteByView(view);
    
    if (!route) {
      console.warn(`[Router] View not found: ${view}`);
      return;
    }

    this.navigateToRoute(route, pushState);
  }

  /**
   * Navigate to a route object
   */
  private navigateToRoute(route: Route, pushState: boolean = true): void {
    const previousRoute = this.currentRoute;
    this.currentRoute = route;

    // Update browser URL if needed (only if not already on this route to avoid duplicate history entries)
    if (pushState && previousRoute?.path !== route.path) {
      this.updateBrowserUrl(route.path);
    }

    // Always emit view change event to ensure proper view activation
    eventManager.emit('view:change', route.view);

    console.log(`[Router] Navigated from ${previousRoute?.path || 'initial'} to ${route.path}`);
  }

  /**
   * Update browser URL
   */
  private updateBrowserUrl(path: string): void {
    const fullPath = this.config.basePath + path;
    
    if (this.config.mode === 'hash') {
      window.location.hash = path;
    } else {
      window.history.pushState({}, '', fullPath);
    }
  }

  /**
   * Get current route
   */
  getCurrentRoute(): Route | null {
    return this.currentRoute;
  }

  /**
   * Get current view
   */
  getCurrentView(): 'library' | 'settings' | 'search' | null {
    return this.currentRoute?.view || null;
  }

  /**
   * Get all available routes
   */
  getRoutes(): Route[] {
    return [...this.routes];
  }

  /**
   * Check if router is initialized
   */
  isRouterInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Destroy router and cleanup
   */
  destroy(): void {
    window.removeEventListener('popstate', this.bindEvents);
    this.isInitialized = false;
    this.currentRoute = null;
  }
}

// Create and export singleton router instance
export const router = new Router();