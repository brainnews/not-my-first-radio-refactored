/**
 * PlaceholderManager - Handles dynamic rotating placeholder text for search inputs
 */

export interface PlaceholderConfig {
  rotationInterval?: number; // milliseconds
  enableTransitions?: boolean;
  pauseOnFocus?: boolean;
}

export interface PlaceholderItem {
  text: string;
  category: 'natural' | 'structured' | 'discovery';
  description?: string; // For accessibility
}

/**
 * Manages dynamic, rotating placeholder text with educational examples
 */
export class PlaceholderManager {
  private inputElement: HTMLInputElement;
  private placeholders: PlaceholderItem[] = [];
  private currentIndex = 0;
  private rotationTimer: number | null = null;
  private isUserInteracting = false;
  private isPaused = false;

  private readonly rotationInterval: number;
  private readonly enableTransitions: boolean;
  private readonly pauseOnFocus: boolean;

  constructor(inputElement: HTMLInputElement, config: PlaceholderConfig = {}) {
    this.inputElement = inputElement;
    this.rotationInterval = config.rotationInterval ?? 3500; // 3.5 seconds
    this.enableTransitions = config.enableTransitions ?? true;
    this.pauseOnFocus = config.pauseOnFocus ?? true;

    this.initializePlaceholders();
    this.setupEventListeners();
    this.start();
  }

  /**
   * Initialize the placeholder examples
   */
  private initializePlaceholders(): void {
    this.placeholders = [
      // Natural Language (MCP-powered) examples
      { 
        text: "Try: French jazz stations", 
        category: 'natural',
        description: "Natural language search example" 
      },
      { 
        text: "Search: Relaxing ambient music", 
        category: 'natural',
        description: "Natural language search example" 
      },
      { 
        text: "Find: BBC radio stations", 
        category: 'natural',
        description: "Natural language search example" 
      },
      { 
        text: "Ask: What's playing smooth jazz?", 
        category: 'natural',
        description: "Natural language search example" 
      },
      { 
        text: "Look for: German classical radio", 
        category: 'natural',
        description: "Natural language search example" 
      },

      // Structured search examples
      { 
        text: "Genre: classical", 
        category: 'structured',
        description: "Structured search by genre" 
      },
      { 
        text: "Country: Germany + Genre: rock", 
        category: 'structured',
        description: "Structured search with filters" 
      },
      { 
        text: "Bitrate: 128+ kbps", 
        category: 'structured',
        description: "Structured search by audio quality" 
      },
      { 
        text: "Language: Spanish", 
        category: 'structured',
        description: "Structured search by language" 
      },
      { 
        text: "Country: United States", 
        category: 'structured',
        description: "Structured search by country" 
      },

      // Discovery prompts
      { 
        text: "Explore stations by country...", 
        category: 'discovery',
        description: "Discovery prompt for browsing" 
      },
      { 
        text: "Browse by genre or language...", 
        category: 'discovery',
        description: "Discovery prompt for filtering" 
      },
      { 
        text: "Discover new stations...", 
        category: 'discovery',
        description: "Discovery prompt for exploration" 
      },
      { 
        text: "Search stations, genres, countries...", 
        category: 'discovery',
        description: "General search prompt" 
      }
    ];

    // Shuffle the placeholders for variety
    this.shufflePlaceholders();
  }

  /**
   * Shuffle placeholders for random order
   */
  private shufflePlaceholders(): void {
    for (let i = this.placeholders.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.placeholders[i], this.placeholders[j]] = [this.placeholders[j], this.placeholders[i]];
    }
  }

  /**
   * Set up event listeners for user interaction
   */
  private setupEventListeners(): void {
    if (this.pauseOnFocus) {
      this.inputElement.addEventListener('focus', this.handleFocus.bind(this));
      this.inputElement.addEventListener('blur', this.handleBlur.bind(this));
    }

    this.inputElement.addEventListener('input', this.handleInput.bind(this));
  }

  /**
   * Handle input focus
   */
  private handleFocus(): void {
    this.isUserInteracting = true;
    this.pause();
  }

  /**
   * Handle input blur
   */
  private handleBlur(): void {
    this.isUserInteracting = false;
    // Resume rotation only if input is empty
    if (!this.inputElement.value.trim()) {
      this.resume();
    }
  }

  /**
   * Handle input changes
   */
  private handleInput(): void {
    const hasValue = this.inputElement.value.trim().length > 0;
    
    if (hasValue && !this.isPaused) {
      this.pause();
    } else if (!hasValue && !this.isUserInteracting && this.isPaused) {
      this.resume();
    }
  }

  /**
   * Start the rotation
   */
  start(): void {
    if (this.placeholders.length === 0) return;
    
    this.setCurrentPlaceholder();
    this.scheduleNextRotation();
  }

  /**
   * Pause the rotation
   */
  pause(): void {
    this.isPaused = true;
    if (this.rotationTimer) {
      clearTimeout(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  /**
   * Resume the rotation
   */
  resume(): void {
    if (!this.isPaused) return;
    
    this.isPaused = false;
    this.scheduleNextRotation();
  }

  /**
   * Stop and clean up
   */
  destroy(): void {
    this.pause();
    
    if (this.pauseOnFocus) {
      this.inputElement.removeEventListener('focus', this.handleFocus.bind(this));
      this.inputElement.removeEventListener('blur', this.handleBlur.bind(this));
    }
    
    this.inputElement.removeEventListener('input', this.handleInput.bind(this));
  }

  /**
   * Schedule the next rotation
   */
  private scheduleNextRotation(): void {
    if (this.isPaused) return;
    
    this.rotationTimer = window.setTimeout(() => {
      this.rotateToNext();
    }, this.rotationInterval);
  }

  /**
   * Rotate to the next placeholder
   */
  private rotateToNext(): void {
    if (this.isPaused) return;
    
    this.currentIndex = (this.currentIndex + 1) % this.placeholders.length;
    
    // If we've gone through all placeholders, shuffle again for variety
    if (this.currentIndex === 0) {
      this.shufflePlaceholders();
    }
    
    this.setCurrentPlaceholder();
    this.scheduleNextRotation();
  }

  /**
   * Set the current placeholder text
   */
  private setCurrentPlaceholder(): void {
    const currentPlaceholder = this.placeholders[this.currentIndex];
    
    if (this.enableTransitions) {
      this.setPlaceholderWithTransition(currentPlaceholder.text);
    } else {
      this.inputElement.placeholder = currentPlaceholder.text;
    }

    // Update aria-label for accessibility
    this.inputElement.setAttribute('aria-label', 
      `Search input. ${currentPlaceholder.description || 'Enter search terms'}`
    );
  }

  /**
   * Set placeholder with smooth transition
   */
  private setPlaceholderWithTransition(newText: string): void {
    // Add transition class for CSS animations
    this.inputElement.classList.add('placeholder-transitioning');
    
    // Short delay to allow for fade-out, then update text
    setTimeout(() => {
      this.inputElement.placeholder = newText;
      
      // Remove transition class after animation
      setTimeout(() => {
        this.inputElement.classList.remove('placeholder-transitioning');
      }, 150); // Half of transition duration
    }, 150);
  }

  /**
   * Get current placeholder information
   */
  getCurrentPlaceholder(): PlaceholderItem {
    return this.placeholders[this.currentIndex];
  }

  /**
   * Manually set a specific placeholder
   */
  setPlaceholder(text: string): void {
    this.pause();
    this.inputElement.placeholder = text;
  }

  /**
   * Add custom placeholders
   */
  addPlaceholders(newPlaceholders: PlaceholderItem[]): void {
    this.placeholders.push(...newPlaceholders);
    this.shufflePlaceholders();
  }

  /**
   * Get all placeholders by category
   */
  getPlaceholdersByCategory(category: 'natural' | 'structured' | 'discovery'): PlaceholderItem[] {
    return this.placeholders.filter(p => p.category === category);
  }
}