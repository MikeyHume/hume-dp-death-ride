// Fix remaining false positives from v2 matching and apply manual overrides
import { readFileSync, writeFileSync } from 'fs';

const updates = JSON.parse(readFileSync(new URL('./yt_updates_v2.json', import.meta.url), 'utf8'));
const unmatched = JSON.parse(readFileSync(new URL('./unmatched.json', import.meta.url), 'utf8'));

// Build lookup: track id → track info
const trackById = {};
for (const t of unmatched) trackById[t.id] = t;

// --- Manual overrides: track_id → correct youtube_video_id (or null to remove) ---
const overrides = {};

// Find track IDs by title for overrides
function findTrackId(title, artist) {
  const match = unmatched.find(t =>
    t.title === title && (!artist || t.artist_name.includes(artist))
  );
  return match?.id;
}

// FALSE POSITIVES TO REMOVE (no YouTube video exists)
const removals = [
  ["cut the lights", "Madalen Duke"],     // matched "All Gold Spaceship" - wrong
  ["DEATHPIXIE'S PROLOGUE", "DEATHPIXIE"], // matched "SAFE WORD" - wrong
  ["set me free", "kai.wav"],              // matched "Take me Home" - wrong
  // DIGITAL KILL SHIT - ULTRA SLOWED: corrected below via override
];
for (const [title, artist] of removals) {
  const id = findTrackId(title, artist);
  if (id) overrides[id] = null;
}

// WRONG MATCHES TO CORRECT
// "walking dead" matched BRAIN ROT — should be angelbaby - walking dead
const walkingDeadId = findTrackId("walking dead", "angelbaby");
if (walkingDeadId) overrides[walkingDeadId] = "CWTMI6WU4aM";

// "SAFE WORD" (original) matched SAFE WORD (DEATHMIX) — should be original
const safeWordId = findTrackId("SAFE WORD", null);
// Find the one that's NOT the Deathmix and NOT slowed/sped
for (const t of unmatched) {
  if (t.title === "SAFE WORD" && t.artist_name === "DEATHPIXIE") {
    overrides[t.id] = "2MRkm7r5Rcw"; // original SAFE WORD
  }
  if (t.title === "SAFE WORD (Slowed + Reverbed)") {
    overrides[t.id] = "2MRkm7r5Rcw"; // original SAFE WORD
  }
  if (t.title === "SAFE WORD (Sped Up)") {
    overrides[t.id] = "2MRkm7r5Rcw"; // original SAFE WORD
  }
}

// "HELL GIRL - Slowed/Sped" matched HELL GIRL II — should be HELL GIRL original
for (const t of unmatched) {
  if (t.title === "HELL GIRL - Slowed + Reverbed") {
    overrides[t.id] = "GZwNZU7AviA"; // HELL GIRL
  }
  if (t.title === "HELL GIRL - Sped Up") {
    overrides[t.id] = "GZwNZU7AviA"; // HELL GIRL
  }
}

// "NIGHTMARECORE - SPED UP" matched WALKING NIGHTMARE — should be NIGHTMARECORE
for (const t of unmatched) {
  if (t.title === "NIGHTMARECORE - SPED UP") {
    overrides[t.id] = "p2hVGRtwEsU"; // NIGHTMARECORE
  }
}

// "DIGITAL KILL SHIT - ULTRA SLOWED" matched KILLAMONSTA — should be DIGITAL KILL SHIT
for (const t of unmatched) {
  if (t.title === "DIGITAL KILL SHIT - ULTRA SLOWED") {
    overrides[t.id] = "83ATuZcDV_4"; // DIGITAL KILL SHIT
  }
}

// Apply overrides
let fixed = [];
let removed = 0;
let corrected = 0;

for (const u of updates) {
  if (u.id in overrides) {
    const newVid = overrides[u.id];
    if (newVid === null) {
      removed++;
      continue; // Remove this entry
    }
    // Correct the video ID
    u.youtube_video_id = newVid;
    u.youtube_url = `https://www.youtube.com/watch?v=${newVid}`;
    u.youtube_thumbnail_url = `https://i.ytimg.com/vi/${newVid}/hqdefault.jpg`;
    // Update title from ytVideos
    const ytVideos = JSON.parse(readFileSync(new URL('./yt_videos_with_durations.json', import.meta.url), 'utf8'));
    const yt = ytVideos.find(v => v.id === newVid);
    if (yt) u.youtube_title = yt.title;
    corrected++;
  }
  fixed.push(u);
}

// Check for tracks that should have been added but weren't (missing from v2)
// These are variant tracks whose originals exist on YouTube but duration estimation was off
const existingIds = new Set(fixed.map(u => u.id));
const ytVideos = JSON.parse(readFileSync(new URL('./yt_videos_with_durations.json', import.meta.url), 'utf8'));
const ytById = {};
for (const v of ytVideos) ytById[v.id] = v;

// Additional mappings for tracks not caught by v2
const additions = [];
for (const t of unmatched) {
  if (existingIds.has(t.id)) continue;

  // Check if this is a variant of a track that has a YouTube video
  let ytId = null;

  // NIGHTMARECORE - ULTRA SLOWED
  if (t.title === "NIGHTMARECORE - ULTRA SLOWED") ytId = "p2hVGRtwEsU";
  // GRIM REAPER - Ultra Slowed
  if (t.title === "GRIM REAPER - Ultra Slowed") ytId = "zadRpdHMD-c";
  // DIGITAL KILL SHIT - ULTRA SLOWED
  if (t.title === "DIGITAL KILL SHIT - ULTRA SLOWED") ytId = "83ATuZcDV_4";

  if (ytId) {
    const yt = ytById[ytId];
    additions.push({
      id: t.id,
      youtube_video_id: ytId,
      youtube_url: `https://www.youtube.com/watch?v=${ytId}`,
      youtube_thumbnail_url: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      youtube_title: yt?.title || '',
      youtube_is_manual: true,
    });
  }
}

fixed = fixed.concat(additions);

writeFileSync(new URL('./yt_updates_final.json', import.meta.url), JSON.stringify(fixed, null, 2));

console.log(`Results:`);
console.log(`  Original entries: ${updates.length}`);
console.log(`  Removed (false positives): ${removed}`);
console.log(`  Corrected (wrong video): ${corrected}`);
console.log(`  Added (missing variants): ${additions.length}`);
console.log(`  Final entries: ${fixed.length}`);
console.log(`\nWrote to scripts/yt_updates_final.json`);

// Summary of truly unmatched tracks (no YouTube video exists)
const finalIds = new Set(fixed.map(u => u.id));
const trulyUnmatched = unmatched.filter(t => !finalIds.has(t.id));
console.log(`\n=== TRULY UNMATCHED: ${trulyUnmatched.length} tracks (no YouTube video exists) ===\n`);
for (const t of trulyUnmatched) {
  console.log(`  "${t.title}" (${t.artist_name})`);
}
