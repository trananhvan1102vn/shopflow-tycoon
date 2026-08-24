import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@shopflow/data': fileURLToPath(new URL('../data/index.js', import.meta.url)) } },
});
