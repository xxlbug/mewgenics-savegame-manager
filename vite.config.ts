import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/mewgenics-savegame-manager/',
  test: {
    environment: 'node',
  },
});
