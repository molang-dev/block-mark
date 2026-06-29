import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      mdparser: path.resolve(__dirname, '../../src/index.ts'),
    },
  },
  server: {
    fs: {
      allow: ['../..'],
    },
  },
})
