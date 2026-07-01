import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/plugins/gfm.ts',
    'src/plugins/html.ts',
    'src/default.css', 'src/light.css', 'src/dark.css',
  ],
  format: ['esm', 'cjs'],
  dts: { entry: ['src/index.ts', 'src/plugins/gfm.ts', 'src/plugins/html.ts'] },
  clean: true,
  external: ['node:fs'],
  esbuildOptions(options) {
    options.target = 'es2020'
  },
})
