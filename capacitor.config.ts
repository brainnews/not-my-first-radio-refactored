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
      backgroundColor: '#2c2c2c'
    }
  }
};

export default config;
