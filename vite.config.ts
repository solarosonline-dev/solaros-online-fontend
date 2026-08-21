import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Backend's local CORS_ORIGINS only allows http://localhost:3000 — keep in sync.
  server: {
    port: 3000,
    strictPort: true,
  },
})
