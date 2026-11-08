// Copies gmail-script/Code.gs into a TypeScript module so ApiFn can hand the script to the user.
// Run with `npm run embed-script -w @finance/api` after editing Code.gs. A unit test fails when the two differ.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "..", "gmail-script", "Code.gs"), "utf8");
const target = join(here, "..", "src", "connections", "gmail-script.generated.ts");
writeFileSync(
  target,
  `// Generated from gmail-script/Code.gs by api/scripts/embed-gmail-script.mjs. Do not edit.\nexport const GMAIL_SCRIPT_TEMPLATE = ${JSON.stringify(source)};\n`,
);
console.log(`wrote ${target}`);
