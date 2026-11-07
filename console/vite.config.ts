import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_API=live proxies /api to the MCP server's console API (VITE_API_TARGET).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.VITE_API_TARGET ?? 'http://localhost:8787',
    },
  },
})
