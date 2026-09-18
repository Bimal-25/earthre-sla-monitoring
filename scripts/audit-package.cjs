'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const forbiddenNames = new Set([
  'node_modules',
  'dist',
  'coverage',
  '.firebase',
]);
const forbiddenFiles = new Set([
  '.env',
  'firestore-debug.log',
  'firebase-debug.log',
]);
const allowedLargeFiles = new Set([
  'package-lock.json',
  path.join('web', 'package-lock.json'),
]);
const maxUnexpectedBytes = 1024 * 1024;

const failures = [];
const largest = [];

function visit(current) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    const relative = path.relative(root, full);

    if (entry.isDirectory()) {
      if (forbiddenNames.has(entry.name)) {
        failures.push(`Forbidden generated directory: ${relative}`);
        continue;
      }
      visit(full);
      continue;
    }

    if (!entry.isFile()) continue;

    const stats = fs.statSync(full);
    largest.push({ relative, bytes: stats.size });

    if (forbiddenFiles.has(entry.name)) {
      failures.push(`Forbidden local/generated file: ${relative}`);
    }
    if (entry.name.endsWith('.tsbuildinfo')) {
      failures.push(`Forbidden TypeScript build artifact: ${relative}`);
    }
    if (entry.name.endsWith('.log')) {
      failures.push(`Forbidden log file: ${relative}`);
    }
    if (stats.size > maxUnexpectedBytes && !allowedLargeFiles.has(relative)) {
      failures.push(
        `Unexpected file larger than 1 MiB: ${relative} (${(stats.size / 1024 / 1024).toFixed(2)} MiB)`,
      );
    }
  }
}

visit(root);
largest.sort((a, b) => b.bytes - a.bytes);

console.log('Largest source-package files:');
for (const item of largest.slice(0, 15)) {
  console.log(`${String((item.bytes / 1024).toFixed(2)).padStart(10)} KiB  ${item.relative}`);
}

if (failures.length > 0) {
  console.error('\nPackage audit FAILED:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('\nPackage audit PASS: no generated dependency/build artifacts or unexpected large files found.');
}
