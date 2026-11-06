import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [
    react(),
  ],
  build: {
    outDir: 'dist/standard',
    assetsInlineLimit: filePath => filePath.endsWith('.svg')
      ? false
      : undefined,
  },
})
