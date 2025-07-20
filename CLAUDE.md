# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development
npm run dev          # Start development server with hot reload (localhost:3000)
npm run build        # Production build with optimization and PWA manifest
npm run preview      # Preview production build locally
npm run type-check   # TypeScript compilation check without emit
npm run lint         # ESLint code quality checks
npm run lint:fix     # Auto-fix ESLint issues
npm run test         # Run Vitest test suite
npm run test:coverage # Run tests with coverage report
```

**Important**: Always run `npm run type-check` and `npm run lint` after making changes to ensure code quality. The build process includes PWA generation, so `npm run build` handles service worker and manifest updates.

## Project Architecture

This is a **modern TypeScript refactor** of a monolithic radio streaming application, transformed from 47,000 tokens into 11 focused modules with event-driven architecture.

### Core Architecture Patterns

**Event-Driven Design**: All module communication happens through a centralized event system (`src/utils/events.ts`). Never call module methods directly - emit events instead:

```typescript
// ✅ Correct: Event-driven communication
eventManager.emit('station:play', station);
eventManager.emit('notification:show', { type: 'success', message: 'Station added' });

// ❌ Avoid: Direct module calls
stationManager.addStation(station); // Creates tight coupling
```

**Module Structure**: Each module follows consistent patterns:
- Constructor dependency injection via config objects
- Private state management with TypeScript interfaces
- Event listener setup in dedicated methods
- Resource cleanup through `destroy()` methods
- Comprehensive error handling with user feedback

**Service Layer**: External integrations are abstracted through services with automatic failover, retry logic, and consistent error handling.

### Key Modules

**App.ts**: Main orchestrator that initializes modules and coordinates inter-module communication. Only this class should directly instantiate modules.

**RadioPlayer** (`src/modules/player/RadioPlayer.ts`):
- HTML5 Audio element management with retry logic
- State tracking (playing, loading, error, volume)
- Keyboard shortcuts (Space, Ctrl+↑/↓ for volume, Ctrl+M for mute)
- Achievement tracking for listening time
- Cross-fade capabilities and audio session management

**StationManager** (`src/modules/stations/StationManager.ts`):
- Station CRUD with localStorage persistence
- Preset system (6 slots with keyboard shortcuts 1-6)
- Data migration for legacy formats
- Import/export functionality (JSON, sharing URLs, QR codes)
- Rendering with sections (favorites, recent, all stations)

**SearchManager** (`src/modules/search/SearchManager.ts`):
- Debounced search (500ms) with Radio Browser API integration
- Preview functionality using separate audio element
- Pagination and filtering (country, genre, bitrate)
- Genre mapping for enhanced search results

**NotificationManager** (`src/modules/notifications/NotificationManager.ts`):
- Toast notifications with 4 types (success, error, warning, info)
- Auto-dismiss with configurable timing
- Action buttons for interactive notifications
- Queue management for multiple simultaneous notifications

### Radio Browser API Integration

**Service**: `src/services/api/radioBrowserApi.ts`
- **Multi-server failover**: Automatically switches between available servers
- **Retry logic**: Exponential backoff with max 3 attempts
- **Rate limiting**: Built-in protection with server switching
- **Response format**: Always returns `{ success: boolean, data?, error? }`

**Available endpoints**:
```typescript
radioBrowserApi.searchStations(query, filters)  // Search with filtering
radioBrowserApi.getStationByUuid(uuid)         // Get specific station
radioBrowserApi.getTopStations(limit)          // Popular stations
radioBrowserApi.getStationsByCountry(code)     // Country-specific stations
```

### State Management

**Distributed State**: No central store - each module manages its own state and coordinates through events.

**Storage**: Type-safe localStorage utilities (`src/utils/storage.ts`) with:
- Enumerated keys (prevents typos): `StorageKeys.STATIONS`, `StorageKeys.USER_SETTINGS`
- Automatic migrations for legacy data
- Cross-tab synchronization
- Usage monitoring and quota management

**Persistent Data**:
- User stations and presets
- Settings and preferences  
- Achievement progress and user stats
- Shared station lists (from QR codes/URLs)

### Event System

**Central Events** (`src/utils/events.ts`):
```typescript
// Station events
'station:play' | 'station:pause' | 'station:add' | 'station:remove'

// Player events
'player:state-changed' | 'player:volume-changed' | 'player:error'

// Search events  
'search:started' | 'search:completed' | 'search:error'

// UI events
'modal:open' | 'modal:close' | 'notification:show'

// Achievement events
'achievements:unlock' | 'achievements:progress'
```

**Event Listener Cleanup**: Always remove listeners in module `destroy()` methods to prevent memory leaks.

### Error Handling Strategy

**Multi-layer Approach**:
1. **Service Level**: API services return standardized `{ success, data?, error? }` format
2. **Module Level**: Try-catch blocks with user-friendly messages via NotificationManager
3. **Global Level**: Window error handlers in App.ts catch uncaught exceptions
4. **User Level**: Clear error messages with suggested actions

**Example Pattern**:
```typescript
try {
  const result = await radioBrowserApi.searchStations(query);
  if (!result.success) {
    this.notificationManager.error(`Search failed: ${result.error}`);
    return;
  }
  // Handle success...
} catch (error) {
  console.error('[SearchManager] Search error:', error);
  this.notificationManager.error('Search temporarily unavailable');
}
```

### UI Patterns

**DOM Utilities**: Use `querySelector` from `src/utils/dom.ts` for type-safe DOM access with automatic error handling.

**Modal System**: All dialogs go through ModalManager with consistent styling, keyboard accessibility (ESC, Tab trapping), and focus management.

**Responsive Design**: Mobile-first approach with breakpoints defined in CSS custom properties.

### Testing Approach

**Framework**: Vitest with coverage reporting
**Strategy**: 
- Unit tests for utility functions
- Integration tests for module interactions  
- Mock external APIs and browser APIs
- Test error handling and edge cases

### PWA Configuration

**Vite PWA Plugin**: Configured for offline support with service worker
**Manifest**: Defined in `vite.config.js` with app icons and theme colors
**Caching Strategy**: Assets cached with versioning, API responses use stale-while-revalidate

### Development Guidelines

**TypeScript**: Full coverage required - no `any` types except for external library integrations
**CSS**: Use CSS custom properties for theming, avoid hard-coded colors/sizes
**Events**: Always emit events for state changes, never modify other modules' state directly
**Error Messages**: Always provide user-friendly error messages with suggested actions
**Performance**: Debounce user inputs, use pagination for large datasets, cleanup resources properly

### Path Aliases (tsconfig.json)

```typescript
import { RadioPlayer } from '@/modules/player/RadioPlayer';
import { LocalStation } from '@/types/station';
import { eventManager } from '@/utils/events';
import { radioBrowserApi } from '@/services/api/radioBrowserApi';
```

### Build Considerations

**Production Build**: Includes code splitting, asset optimization, PWA manifest generation
**Legacy Support**: Configured for ES2015 compatibility
**Bundle Analysis**: Manual chunks defined for vendor code and utilities
**CSS Processing**: Includes hash-based asset naming for cache busting