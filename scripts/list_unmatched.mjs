import { readFileSync } from 'fs';
const data = JSON.parse(readFileSync(new URL('./unmatched.json', import.meta.url), 'utf8'));
console.log(`Total unmatched tracks: ${data.length}\n`);
const artists = {};
for (const t of data) {
  const a = t.artist_name;
  if (!artists[a]) artists[a] = [];
  artists[a].push(t);
}
for (const a of Object.keys(artists).sort()) {
  const ts = artists[a];
  console.log(`=== ${a} (${ts.length} tracks) ===`);
  for (const t of ts) {
    const ms = t.duration_ms || 0;
    const dur = `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
    console.log(`  [${t.id}] ${t.title} (${dur})`);
  }
  console.log();
}
