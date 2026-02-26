#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Read latest iPhone perf results
const telDir = path.join(ROOT, 'telemetry');
const files = fs.readdirSync(telDir).filter(f => f.startsWith('anim-perf-')).sort();
if (files.length === 0) { console.log('No anim perf results found'); process.exit(1); }

const latest = JSON.parse(fs.readFileSync(path.join(telDir, files[files.length - 1]), 'utf8'));
console.log('File:', files[files.length - 1]);
console.log('Runs:', latest.runs?.length || 0);

if (latest.runs) {
  const grouped = {};
  for (const r of latest.runs) {
    const key = r.variant + (r.crt ? '+CRT' : '') + (r.adaptive ? '+snap' : '') + '@s' + r.scale;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  }

  // Print sorted by variant
  const entries = Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  console.log('\n' + 'Config'.padEnd(40) + 'FPS'.padStart(5) + 'Judder'.padStart(8) + '  σ(ms)'.padStart(8));
  console.log('-'.repeat(61));
  for (const [key, runs] of entries) {
    const avgJudder = runs.reduce((s, r) => s + r.judder, 0) / runs.length;
    const avgFps = runs.reduce((s, r) => s + r.avgFps, 0) / runs.length;
    const avgStddev = runs.reduce((s, r) => s + r.stddev, 0) / runs.length;
    console.log(
      key.padEnd(40) +
      avgFps.toFixed(0).padStart(5) +
      (avgJudder.toFixed(0) + '%').padStart(8) +
      avgStddev.toFixed(1).padStart(8)
    );
  }
}

// Also read all-anims-inventory if it exists
const invPath = path.join(telDir, 'all-anims-inventory.json');
if (fs.existsSync(invPath)) {
  const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));
  console.log('\n\nAnimation Inventory: ' + inv.length + ' assets cataloged');
}
