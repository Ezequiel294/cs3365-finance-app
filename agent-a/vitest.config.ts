import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      // The Gmail script is bundled as text (esbuild loader "text" in the Lambda build).
      name: 'gs-as-text',
      enforce: 'pre',
      load(id) {
        if (id.endsWith('.gs')) return `export default ${JSON.stringify(readFileSync(id, 'utf8'))};`;
        return null;
      },
    },
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['api/test/**/*.test.ts', 'shared/**/*.test.ts', 'app/**/*.test.ts'],
    // The default forks pool can hang at exit in sandboxed shells.
    pool: 'threads',
    testTimeout: 20000,
  },
});
