import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { atlasPwa } from './vite-plugins/atlas-pwa.ts';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  // Relative base: the build works at any GitHub Pages path (user.github.io/<repo>/) without config.
  base: './',
  plugins: [preact(), atlasPwa({ version: pkg.version })],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 0,
  },
  server: { host: true },
  preview: { host: true },
});
