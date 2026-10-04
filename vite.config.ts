import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Suppress chunk size warning: the bundle is 162KB gzipped which is acceptable
    // for a private internal tool (not a public consumer website).
    chunkSizeWarningLimit: 700,
  },
})
