import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'inline-svg-icons',
      apply: 'build',
      transformIndexHtml: {
        order: 'pre',
        // Vite 默认不内联 link 图标，单文件构建显式启用资源内联。
        handler: html => html.replace(/(<link\s[^>]*?href=")([^"?]+\.svg)(")/g, '$1$2?inline$3'),
      },
    },
    viteSingleFile(),
  ],
  build: { outDir: 'dist/single' },
})
