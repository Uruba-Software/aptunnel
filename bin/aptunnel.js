#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Verify minimum Node.js version
const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  process.stderr.write(
    `aptunnel requires Node.js 18 or higher. You are running ${process.version}.\n`
  );
  process.exit(1);
}

// Launch the CLI router
// Use pathToFileURL so Windows absolute paths (D:\...) are valid ESM specifiers.
const entryUrl = pathToFileURL(resolve(__dirname, '../src/index.js')).href;
import(entryUrl).catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
