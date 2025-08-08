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

# Cloudflare Pages Deployment
npm run pages:build  # Build with type-check and lint validation
npm run pages:deploy # Deploy to Cloudflare Pages production
npm run pages:deploy:preview # Deploy to preview environment
```

**Important**: Always run `npm run type-check` and `npm run lint` after making changes to ensure code quality. The build process includes PWA generation, so `npm run build` handles service worker and manifest updates.

## Project Architecture

This is a **modern TypeScript refactor** of a monolithic radio streaming application, transformed from 47,000 tokens into 11 focused modules with event-driven architecture.

### Core Architecture Patterns

**Event-Driven Design**: All module communication happens through a centralized event system (`src/utils/events.ts`). Never call module methods directly - emit events instead:

```typescript
// ✅ Correct: Event-driven communication
eventManager.emit('station:play-request', station);
eventManager.emit('notification:show', { type: 'success', message: 'Station added' });

// ❌ Avoid: Direct module calls
stationManager.addStation(station); // Creates tight coupling
```

**CRITICAL EVENT NAMING**: Use `station:play-request` for triggering playback, NOT `station:play`. The App.ts listens for `station:play-request` to actually start playback, while `station:play` is emitted BY the player when playback begins.

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
- Rendering with sections (presets section has NO header/collapse functionality)

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

**AchievementManager** (`src/modules/achievements/AchievementManager.ts`):
- Comprehensive gamification system with categorized achievements
- Collection achievements (first station, 5/20/50 stations)
- Discovery achievements (world explorer, quality hunter)  
- Listening achievements (music lover, night owl, early bird)
- Social achievements (sharing stations) and technical achievements (data management)
- Progress tracking with persistent storage and user statistics
- Real-time achievement unlocking with notification integration

**UserManager** (`src/modules/user/UserManager.ts`):
- Username management with validation and profanity filtering
- Auto-generated usernames with positive adjective/noun combinations
- User statistics tracking (total stations, play time, countries explored)
- Cross-tab storage synchronization for user data
- Achievement progress integration and listening time coordination

**Router** (`src/router/Router.ts`):
- Lightweight client-side routing with history management
- View navigation between library, search, and settings
- Browser back/forward button support
- URL state management for bookmarking and sharing
- Event-driven view coordination with existing UI system

### Auto-Generated Lists System

**Service**: `src/services/lists/AutoListGenerator.ts`
- **Smart Station Grouping**: Automatically creates curated collections from user's library
- **Genre Detection**: Groups stations by music genre using tag analysis
- **Station Name Cleaning**: Removes metadata patterns (bitrate, "Radio" suffix) and extracts call signs
- **Dynamic List Generation**: Creates 2-4 lists based on library size and station diversity
- **Quality-Based Curation**: Prioritizes higher-quality stations and removes duplicates
- **Configurable Thresholds**: Minimum stations per genre (3), library size thresholds (15)

**Integration**: Auto-generated lists appear in LibraryView as horizontal scrolling sections with simplified station cards that emit `station:play-request` events.

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

### Metadata Extraction System

**Service**: `src/services/metadata/MetadataExtractor.ts`
- **ICY Metadata Extraction**: Extracts station name, description, bitrate, genre from stream headers
- **Audio Format Detection**: Identifies stream format (MP3, AAC, OGG) from HTTP headers
- **Favicon Discovery**: Attempts to find station icons from common favicon paths
- **Domain Analysis**: Infers country information from TLD and domain patterns
- **Radio Browser Fallback**: Uses Radio Browser API when direct extraction fails
- **Multi-source Aggregation**: Combines data from multiple sources with intelligent priority
- **Timeout Management**: Configurable timeouts with graceful fallback handling

### Enhanced Sharing System

**Service**: `src/services/sharing/SharingService.ts`
- **Custom URL Shortening**: Integration with `s.notmyfirstradio.com` for compact share URLs
- **Station List Sharing**: Share individual stations or curated collections
- **QR Code Generation**: Create QR codes for easy mobile sharing
- **Username Integration**: Associate shared lists with user identities
- **Mixed Station Types**: Support both Radio Browser stations (UUID-based) and manual stations (full data)
- **URL Parameter Parsing**: Handle incoming shared station data from URLs

### Bookmarklet Integration

**Files**: `public/bookmarklet/bookmarklet.js`, `public/bookmarklet/install.html`
- **Smart Stream Detection**: Automatically detects audio streams on any webpage
- **Multiple Detection Methods**: Scans HTML audio elements, streaming links, and JavaScript variables
- **Stream Validation**: Filters out non-radio services (YouTube, Spotify, etc.)
- **Interactive Selection**: Modal interface for choosing from multiple detected streams
- **Metadata Extraction**: Automatically extracts station name, favicon, and homepage
- **One-Click Integration**: Opens main app with detected station pre-filled for addition

### Curated Station Collections

**Starter Packs**: `public/starter-packs/` 
- **Genre Collections**: Pre-curated stations for ambient, blues, classical, jazz, K-pop, etc.
- **Location-Based**: City-specific collections (Austin radio scene)
- **Specialty Formats**: College radio, jungle/drum & bass, experimental noise
- **Thumbnail Previews**: Visual collection browsing with genre artwork
- **One-Click Import**: Easy bulk addition of thematic station groups

### State Management

**Distributed State**: No central store - each module manages its own state and coordinates through events.

**Storage**: Type-safe localStorage utilities (`src/utils/storage.ts`) with:
- Enumerated keys (prevents typos): `StorageKeys.STATIONS`, `StorageKeys.USER_SETTINGS`, `StorageKeys.ACHIEVEMENTS`, `StorageKeys.USERNAME`, `StorageKeys.USER_STATS`, `StorageKeys.EXPLORED_COUNTRIES`, `StorageKeys.STATION_LISTENING_TIMES`
- Automatic migrations for legacy data
- Cross-tab synchronization for real-time user data updates
- Usage monitoring and quota management

**Persistent Data**:
- User stations and presets with listening time tracking
- Achievement progress and unlock status across categories
- User statistics (play time, countries explored, stations added)
- Username and user profile data
- Settings and preferences  
- Shared station lists (from QR codes/URLs)
- Per-station listening time analytics

### Event System

**Central Events** (`src/utils/events.ts`):
```typescript
// Station events
'station:play-request' | 'station:pause' | 'station:add' | 'station:remove' | 'station:added'

// Player events
'player:state-changed' | 'player:volume-changed' | 'player:error' | 'player:listening-time'

// Search events  
'search:started' | 'search:completed' | 'search:error'

// UI events
'modal:open' | 'modal:close' | 'notification:show' | 'view:change'

// Achievement events
'achievements:unlock' | 'achievements:progress' | 'achievements:check' | 'achievement:unlocked' | 'achievements:reset' | 'achievements:request-data'

// User events
'user:loaded' | 'user:username-changed' | 'user:username-error' | 'user:stats-updated' | 'user:stats-reset'

// Batch events
'batch:flush'
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

**LibraryView Architecture**: The LibraryView delegates actual station rendering to StationManager while handling auto-generated lists directly. This hybrid approach allows the LibraryView to own the layout while preserving StationManager's functionality.

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
**Bundle Analysis**: Manual chunks defined for vendor code (`qrcode`) and utilities
**CSS Processing**: Includes hash-based asset naming for cache busting
**Dependencies**: Core runtime dependencies include `jsqr` for QR code scanning and `qrcode` for QR generation

### Deployment

**Platform**: Cloudflare Pages with global CDN distribution
**Configuration**: wrangler.toml defines project settings and build output directory
**Process**: 
1. `npm run pages:build` - Validates TypeScript and ESLint, then builds
2. `npm run pages:deploy` - Deploys to production via Wrangler CLI
3. Custom domain configuration via Cloudflare dashboard

**Benefits of Cloudflare Pages**:
- Global CDN with edge caching
- Automatic HTTPS and security headers
- Git integration for automatic deployments
- Built-in analytics and performance monitoring
- Superior performance vs GitHub Pages