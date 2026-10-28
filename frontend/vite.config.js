import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8003,
    strictPort: true,
    // Optional dev proxy: lets the app call relative "/api/..." paths too.
    // The app itself talks directly to VITE_API_BASE_URL (see src/api/client.js).
    proxy: {
      '/api': { target: 'http://localhost:8004', changeOrigin: true },
      '/health': { target: 'http://localhost:8004', changeOrigin: true },
      '/codecs': { target: 'http://localhost:8004', changeOrigin: true },
    },
  },
})
