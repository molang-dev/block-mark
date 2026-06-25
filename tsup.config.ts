import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['node:fs'],
  esbuildOptions(options) {
    options.target = 'es2020'
  },
})
