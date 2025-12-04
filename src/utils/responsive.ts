/**
 * Responsive design utilities and testing helpers
 */

export interface BreakpointConfig {
  name: string;
  minWidth: number;
  maxWidth?: number;
}

export const breakpoints: BreakpointConfig[] = [
  { name: 'mobile', minWidth: 0, maxWidth: 767 },
  { name: 'tablet', minWidth: 768, maxWidth: 1023 },
  { name: 'desktop', minWidth: 1024 }
];

/**
 * Get current breakpoint based on window width
 */
export function getCurrentBreakpoint(): string {
  const width = window.innerWidth;
  
  for (const bp of breakpoints) {
    if (width >= bp.minWidth && (!bp.maxWidth || width <= bp.maxWidth)) {
      return bp.name;
    }
  }
  
  return 'unknown';
}

/**
 * Check if current screen size matches a breakpoint
 */
export function isBreakpoint(breakpointName: string): boolean {
  return getCurrentBreakpoint() === breakpointName;
}

/**
 * Add responsive design debugging helper (development only)
 */
export function addResponsiveDebugger(): void {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    const debuggerElement = document.createElement('div');
    debuggerElement.id = 'responsive-debugger';
    debuggerElement.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
      z-index: 10000;
      pointer-events: none;
    `;
    
    function updateDebugger() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const breakpoint = getCurrentBreakpoint();
      
      debuggerElement.textContent = `${breakpoint} | ${width}×${height}`;
    }
    
    updateDebugger();
    window.addEventListener('resize', updateDebugger);
    document.body.appendChild(debuggerElement);
  }
}

/**
 * Test touch target sizes (minimum 44px recommended)
 */
export function validateTouchTargets(): void {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && isBreakpoint('mobile')) {
    const interactiveElements = document.querySelectorAll('button, a, input, select, [role="button"]');
    const minTouchSize = 44;
    
    interactiveElements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const tooSmall = rect.width < minTouchSize || rect.height < minTouchSize;
      
      if (tooSmall) {
        console.warn('Touch target too small:', {
          element,
          size: `${rect.width}×${rect.height}`,
          minimum: `${minTouchSize}×${minTouchSize}`
        });

        // Visual indicator removed - was showing in native apps
        // (element as HTMLElement).style.outline = '2px solid red';
      }
    });
  }
}

/**
 * Test for horizontal scrolling issues
 */
export function checkHorizontalOverflow(): void {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    const elements = document.querySelectorAll('*');
    
    elements.forEach((element) => {
      const rect = element.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      if (rect.right > viewportWidth) {
        console.warn('Element causing horizontal overflow:', {
          element,
          elementWidth: rect.width,
          elementRight: rect.right,
          viewportWidth
        });
      }
    });
  }
}

/**
 * Add viewport size classes to body for CSS targeting
 */
export function addViewportClasses(): void {
  const body = document.body;
  const currentBreakpoint = getCurrentBreakpoint();
  
  // Remove existing breakpoint classes
  breakpoints.forEach(bp => {
    body.classList.remove(`viewport-${bp.name}`);
  });
  
  // Add current breakpoint class
  body.classList.add(`viewport-${currentBreakpoint}`);
  
  // Add specific size classes
  if (window.innerWidth <= 375) {
    body.classList.add('viewport-small-mobile');
  } else {
    body.classList.remove('viewport-small-mobile');
  }
  
  if (window.innerHeight <= 600) {
    body.classList.add('viewport-short');
  } else {
    body.classList.remove('viewport-short');
  }
}

/**
 * Initialize responsive utilities
 */
export function initResponsiveUtils(): void {
  addViewportClasses();
  
  window.addEventListener('resize', () => {
    addViewportClasses();
  });
  
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    //addResponsiveDebugger();
    
    // Run validation after DOM is loaded
    setTimeout(() => {
      validateTouchTargets();
      checkHorizontalOverflow();
    }, 1000);
  }
}

/**
 * Get optimal font size for current viewport
 */
export function getResponsiveFontSize(baseSize: number): number {
  const breakpoint = getCurrentBreakpoint();
  
  switch (breakpoint) {
    case 'mobile':
      return baseSize * 0.9;
    case 'tablet':
      return baseSize;
    case 'desktop':
      return baseSize * 1.1;
    default:
      return baseSize;
  }
}

/**
 * Get optimal spacing for current viewport
 */
export function getResponsiveSpacing(baseSpacing: number): number {
  const breakpoint = getCurrentBreakpoint();
  
  switch (breakpoint) {
    case 'mobile':
      return Math.max(baseSpacing * 0.75, 8); // Minimum 8px
    case 'tablet':
      return baseSpacing;
    case 'desktop':
      return baseSpacing * 1.25;
    default:
      return baseSpacing;
  }
}