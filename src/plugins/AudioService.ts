import { registerPlugin } from '@capacitor/core';

export interface AudioServicePlugin {
  startForegroundService(options: { stationName: string }): Promise<{ success: boolean }>;
  stopForegroundService(): Promise<{ success: boolean }>;
  updatePlaybackState(options: { stationName: string; isPlaying: boolean }): Promise<{ success: boolean }>;
  addListener(eventName: 'mediaCommand', listenerFunc: (data: { command: string }) => void): Promise<any>;
  removeAllListeners(): Promise<void>;
}

const AudioService = registerPlugin<AudioServicePlugin>('AudioService');

export default AudioService;