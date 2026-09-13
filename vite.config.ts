import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'SolarOS — The Operating System for Solar EPCs',
        short_name: 'SolarOS',
        description: 'Site Survey to Asset Management, unified.',
        theme_color: '#2563eb',
        background_color: '#f4f6f8',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Default is 2 MiB; the main bundle was already right at that
        // ceiling (no route-based code splitting anywhere in the app yet),
        // and the Plant Design module's ported logic (layoutEngine.ts,
        // geometry.ts, etc. - all pure JS/TS, no Three.js) pushed it just
        // over. Scene3D itself (the one genuinely heavy, Three.js-based
        // piece) is already split into its own lazy-loaded chunk instead of
        // being covered by this bump - see its React.lazy() import in
        // PlantDesignEditor.tsx.
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // Backend's local CORS_ORIGINS only allows http://localhost:3000 — keep in sync.
  server: {
    port: 3000,
    strictPort: true,
  },
})
