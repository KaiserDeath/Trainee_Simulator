import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 1. Import the plugin
import { fileURLToPath } from 'node:url'

export default defineConfig({
  cacheDir: fileURLToPath(new URL('./.cache/vite/', import.meta.url)),
  plugins: [
    react(),
    tailwindcss(), // 2. Add it to the plugins array
  ],
})
