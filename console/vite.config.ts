import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// VITE_API=live proxies /api to the MCP server's console API (VITE_API_TARGET).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    proxy: {
      '/api': process.env.VITE_API_TARGET ?? 'http://localhost:8787',
    },
  },
})
