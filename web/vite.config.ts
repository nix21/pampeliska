import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = 'http://localhost:5290'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': api,
      '/auth': api,
      '/signin-google': api,
      // MCP + OAuth pro Claude: Host musí zůstat localhost:5174 (zkrácený zápis nastavuje changeOrigin: true),
      // jinak issuer a resource v metadatech neodpovídají adrese, na kterou se klient připojuje
      '/mcp': { target: api, changeOrigin: false },
      '/oauth': { target: api, changeOrigin: false },
      '/.well-known': { target: api, changeOrigin: false },
    },
  },
  build: {
    outDir: '../src/Pampeliska.Api/wwwroot',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
})
