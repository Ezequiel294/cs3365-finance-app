// Bundles api/src/index.ts into api/dist/index.mjs: the one code bundle behind ApiFn and
// ImportWorkerFn. The CDK app calls buildApi() at synth time; `npm run build:api` runs it alone.
import { buildSync } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const API_DIST = join(here, 'dist');

export function buildApi() {
  rmSync(API_DIST, { recursive: true, force: true });
  mkdirSync(API_DIST, { recursive: true });
  buildSync({
    entryPoints: [join(here, 'src', 'index.ts')],
    outfile: join(API_DIST, 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    minify: true,
    sourcemap: true,
    sourcesContent: false,
    legalComments: 'none',
    loader: { '.gs': 'text' },
    // The Node.js 24 Lambda runtime ships AWS SDK v3.
    external: ['@aws-sdk/*', '@smithy/*'],
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
    logLevel: 'warning',
  });
  return API_DIST;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildApi();
  console.log(`Built ${join(API_DIST, 'index.mjs')}`);
}
