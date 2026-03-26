#!/usr/bin/env node

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
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
import(resolve(__dirname, '../src/index.js')).catch((err) => {
  process.stderr.write(`Fatal error: ${err.message}\n`);
  process.exit(1);
});
