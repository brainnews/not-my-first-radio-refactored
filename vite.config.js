import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import legacy from '@vitejs/plugin-legacy';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    }),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3}'],
        // Don't cache CSS files with generic names - let hashed names handle caching
        dontCacheBustURLsMatching: /^\/assets\//,
        runtimeCaching: [
          {
            urlPattern: /\.css$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'css-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              }
            }
          }
        ]
      },
      manifest: {
        name: 'Not My First Radio',
        short_name: 'NMFR',
        description: 'Algorithm-free internet radio player',
        theme_color: '#2c2c2c',
        background_color: '#2c2c2c',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icons/icon192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@/modules': resolve(__dirname, 'src/modules'),
      '@/components': resolve(__dirname, 'src/components'),
      '@/services': resolve(__dirname, 'src/services'),
      '@/utils': resolve(__dirname, 'src/utils'),
      '@/types': resolve(__dirname, 'src/types')
    }
  },
  build: {
    target: 'es2015',
    minify: 'terser',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks: {
          vendor: ['qrcode'],
          utils: ['src/utils/index.ts']
        },
        // Ensure CSS files get unique hashes
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'assets/[name]-[hash].css';
          }
          return 'assets/[name]-[hash].[ext]';
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});