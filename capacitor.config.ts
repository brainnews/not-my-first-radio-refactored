import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.notmyfirstradio.app',
  appName: 'Not My First Radio',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    App: {
      launchUrl: 'com.notmyfirstradio.app'
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#2c2c2c',
      overlaysWebView: true
    },
    // Audio session configuration for background playback
    CapacitorHttp: {
      enabled: true
    },
    BackgroundTask: {
      label: 'Radio Background Playback',
      description: 'Keeps radio playing in the background'
    },
    NativeAudio: {
      fade: true
    }
  },
  // iOS-specific configuration for background audio
  ios: {
    backgroundModes: ['audio']
  },
  // Android-specific configuration
  android: {
    allowMixedContent: true,
    useLegacyBridge: false
  }
};

export default config;
