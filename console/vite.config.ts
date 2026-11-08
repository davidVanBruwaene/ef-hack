import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// VITE_API=live proxies /api to the MCP server's console API (VITE_API_TARGET) and the store's routes to the store (VITE_STORE_TARGET), so both share this origin.
const publicUrl = process.env.PUBLIC_URL

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    proxy: {
      '/api': process.env.VITE_API_TARGET ?? 'http://localhost:8787',
      '^/(auth|me|network|invite|join|pair|dev)(/|\\?|$)': process.env.VITE_STORE_TARGET ?? 'http://localhost:8790',
    },
    // Vite answers 403 to a Host it doesn't know, such as the tunnel's public hostname.
    allowedHosts: publicUrl ? [new URL(publicUrl).hostname] : [],
  },
})
