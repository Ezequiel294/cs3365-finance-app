import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      // The Gmail Apps Script is bundled as text (esbuild `text` loader in the Lambda build).
      name: 'gs-as-text',
      transform(code, id) {
        if (id.endsWith('.gs')) return { code: `export default ${JSON.stringify(code)};`, map: null };
        return null;
      },
    },
  ],
  test: {
    include: ['shared/test/**/*.test.ts', 'api/test/**/*.test.ts'],
    environment: 'node',
    // Worker threads: the forks pool cannot terminate its child processes inside the agent sandbox.
    pool: 'threads',
    env: { AWS_REGION: 'us-east-2', AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test' },
  },
});
