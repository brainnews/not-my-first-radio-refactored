import { LocalStation } from './station';

/**
 * Application state interface
 */
export interface AppState {
  currentStation: LocalStation | null;
  stations: LocalStation[];
  isPlaying: boolean;
  volume: number;
  username: string;
  currentView: 'library' | 'settings' | 'search';
  settings: AppSettings;
}

/**
 * Application settings
 */
export interface AppSettings {
}

/**
 * Audio player state
 */
export interface PlayerState {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  hasError: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
}

/**
 * Notification types
 */
export type NotificationType = 'success' | 'error' | 'warning' | 'info';

/**
 * Notification interface
 */
export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
  action?: {
    label: string;
    callback: () => void;
  };
}

/**
 * Modal types
 */
export type ModalType = 
  | 'qr-code' 
  | 'add-station' 
  | 'settings' 
  | 'achievements' 
  | 'terms' 
  | 'confirmation';

/**
 * Modal state
 */
export interface ModalState {
  type: ModalType | null;
  isOpen: boolean;
  data?: any;
}

/**
 * Event types for the event system
 */
export type AppEventType = 
  | 'station:play'
  | 'station:pause'
  | 'station:stop'
  | 'station:add'
  | 'station:remove'
  | 'station:remove-by-uuid'
  | 'station:update'
  | 'station:play-request'
  | 'station:toggle-play'
  | 'station:selected'
  | 'station:loading'
  | 'station:ready'
  | 'station:ended'
  | 'station:error'
  | 'station:added'
  | 'station:removed'
  | 'station:updated'
  | 'station:note-updated'
  | 'station:share'
  | 'user:login'
  | 'user:logout'
  | 'user:loaded'
  | 'user:username-change'
  | 'user:username-changed'
  | 'user:username-error'
  | 'user:stats-update'
  | 'user:stats-updated'
  | 'user:stats-reset'
  | 'settings:change'
  | 'settings:changed'
  | 'settings:open'
  | 'notification:show'
  | 'modal:open'
  | 'modal:close'
  | 'modal:add-station'
  | 'player:state-changed'
  | 'player:time-changed'
  | 'player:volume-changed'
  | 'player:mute-toggled'
  | 'player:listening-time'
  | 'player:destroyed'
  | 'player:pause'
  | 'achievements:check'
  | 'achievements:unlock'
  | 'achievements:reset'
  | 'achievements:reset-complete'
  | 'achievements:request-data'
  | 'achievements:show-modal'
  | 'achievements:hide-modal'
  | 'achievement:unlocked'
  | 'stations:loaded'
  | 'stations:saved'
  | 'stations:clear'
  | 'stations:cleared'
  | 'stations:import'
  | 'stations:import-merge'
  | 'stations:imported'
  | 'stations:display'
  | 'preset:set'
  | 'preset:removed'
  | 'preset:select-slot'
  | 'preset:select-station'
  | 'data:import'
  | 'data:import-modal'
  | 'data:export'
  | 'app:initialized'
  | 'app:hidden'
  | 'app:visible'
  | 'view:change'
  | 'view:changed'
  | 'view:library'
  | 'view:search'
  | 'view:settings'
  | 'library:share'
  | 'library:filter-changed'
  | 'library:render-stations'
  | 'library:render-presets'
  | 'library:get-stations'
  | 'library:stations-response'
  | 'stations:share'
  | 'stations:share-url'
  | 'stations:share-qr'
  | 'stations:export-json'
  | 'settings:update'
  | 'settings:reset'
  | 'settings:export'
  | 'settings:import'
  | 'settings:exported'
  | 'settings:imported'
  | 'settings:import-error'
  | 'settings:data-cleared'
  | 'achievement:unlock'
  | 'starter-pack:preview'
  | 'starter-pack:add'
  | 'search:execute'
  | 'search:started'
  | 'search:completed'
  | 'search:more-loaded'
  | 'search:error'
  | 'search:cleared'
  | 'search:clear'
  | 'search:filter'
  | 'search:load-more'
  | 'search:preview'
  | 'search:stop-preview'
  | 'search:preview-state'
  | 'search:transfer-to-main'
  | 'search:get-countries'
  | 'search:countries-response'
  | 'search:get-genres'
  | 'search:genres-response'
  | 'search:validating'
  | 'search:validation-progress'
  | 'search:validation-complete'
  | 'search:validation-cancelled'
  | 'search:station-validated'
  | 'search:station-validation-failed'
  | 'search:immediate-results'
  | 'batch:flush';

/**
 * Event interface
 */
export interface AppEvent {
  type: AppEventType;
  payload?: any;
  timestamp: number;
}

/**
 * Achievement data
 */
export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: string;
  progress?: number;
  maxProgress?: number;
}

/**
 * User statistics
 */
export interface UserStats {
  totalStationsAdded: number;
  totalPlayTime: number;
  stationsPlayed: number;
  countriesExplored: number;
  achievementsUnlocked: number;
  dateJoined: string;
}