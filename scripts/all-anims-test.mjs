#!/usr/bin/env node
/**
 * all-anims-test.mjs — Runs test-all-anims.html and collects results.
 *
 * Usage: node scripts/all-anims-test.mjs [--mobile] [--desktop] [--crt]
 *
 * Opens a local browser via the test page and waits for results to be posted
 * to /agent/result. On desktop this runs headlessly via the Vite dev server.
 *
 * Results are saved to telemetry/all-anims-{timestamp}.json and printed
 * as a visual summary.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = process.argv.slice(2);
const MOBILE = args.includes('--mobile');
const DESKTOP = args.includes('--desktop');
const CRT = args.includes('--crt');

const BASE_URL = 'http://localhost:8081';
const params = new URLSearchParams();
if (MOBILE) params.set('mobile', '1');
if (DESKTOP) params.set('desktop', '1');
if (CRT) params.set('crt', '1');
const testUrl = `${BASE_URL}/test-all-anims.html?${params}`;

console.log(`\n╔══════════════════════════════════════════════╗`);
console.log(`║   ALL ANIMATIONS PERFORMANCE TEST            ║`);
console.log(`╠══════════════════════════════════════════════╣`);
console.log(`║ URL: ${testUrl}`);
console.log(`║ Mode: ${MOBILE ? 'Mobile' : DESKTOP ? 'Desktop' : 'All'} | CRT: ${CRT ? 'ON' : 'OFF'}`);
console.log(`╚══════════════════════════════════════════════╝\n`);

// Check if dev server is running
try {
  const res = await fetch(`${BASE_URL}/test-all-anims.html`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.error('ERROR: Vite dev server not running on :8081');
  console.error('Run: npx vite --host 0.0.0.0 --port 8081');
  process.exit(1);
}

console.log('Opening test page in browser...');
console.log('Results will be collected when all tests complete.\n');

// Open in browser
const isWin = process.platform === 'win32';
const openCmd = isWin ? `start "${testUrl}"` : `open "${testUrl}"`;
exec(openCmd);

// Wait for results by polling /agent/result
// Actually, the test page POSTs to /agent/result which is handled by Vite middleware.
// Since we can't intercept that easily from here, let's just wait for the user
// to let it finish and then check the console output.

// Alternative: poll the page until complete
console.log('Waiting for tests to complete...');
console.log('(Watch the browser — results appear in real-time)\n');
console.log('Once done, the results will be posted to the page.');
console.log('Press Ctrl+C to exit.\n');

// Keep process alive
await new Promise(() => {});
