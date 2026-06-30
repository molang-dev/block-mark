import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts', 'src/default.css', 'src/light.css', 'src/dark.css'],
  format: ['esm', 'cjs'],
  dts: { entry: 'src/index.ts' },
  clean: true,
  external: ['node:fs'],
  esbuildOptions(options) {
    options.target = 'es2020'
  },
})
