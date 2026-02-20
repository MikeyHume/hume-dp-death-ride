// Match YouTube videos to Supabase tracks using duration + title matching
// Strategy: 1) Filter by duration (within tolerance), 2) Score by title word match %
import { readFileSync } from 'fs';

const unmatched = JSON.parse(readFileSync(new URL('./unmatched.json', import.meta.url), 'utf8'));
const ytVideos = JSON.parse(readFileSync(new URL('./yt_videos_with_durations.json', import.meta.url), 'utf8'));

// Duration tolerance in ms (YouTube videos may be slightly longer due to intros/outros)
const DUR_TOLERANCE_MS = 15000; // 15 seconds

function normalize(s) {
  return s.toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strip common suffixes and variant tags for core title comparison
function extractCore(title) {
  return normalize(title)
    .replace(/\b(official|visualizer|music video|lyric video|halloween special|christmas special|feat\.?)\b/g, '')
    .replace(/\b(sped up|slowed|reverbed|ultra slowed|deathmix|sped|slowed & reverbed|slowed \+ reverbed)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Calculate word overlap percentage between two strings
function wordMatchPct(a, b) {
  const wordsA = extractCore(a).split(' ').filter(w => w.length > 1);
  const wordsB = extractCore(b).split(' ').filter(w => w.length > 1);
  if (wordsA.length === 0) return 0;

  let matches = 0;
  for (const wa of wordsA) {
    if (wordsB.some(wb => wb === wa || (wa.length > 3 && wb.includes(wa)) || (wb.length > 3 && wa.includes(wb)))) {
      matches++;
    }
  }
  return matches / wordsA.length;
}

// Check if track is a slowed/sped/ultra variant
function getVariantType(title) {
  const t = title.toLowerCase();
  if (/ultra slowed/i.test(t)) return 'ultra-slowed';
  if (/slowed/i.test(t)) return 'slowed';
  if (/sped up/i.test(t)) return 'sped';
  return 'original';
}

// For variant tracks, estimate the original duration
// Sped up versions are typically 0.75-0.85x the duration
// Slowed versions are typically 1.15-1.3x the duration
// Ultra slowed are typically 1.5-2x the duration
function estimateOriginalDuration(durationMs, variant) {
  switch (variant) {
    case 'sped': return durationMs / 0.8; // sped up → longer original
    case 'slowed': return durationMs / 1.2; // slowed → shorter original
    case 'ultra-slowed': return durationMs / 1.6; // ultra slowed → much shorter original
    default: return durationMs;
  }
}

const matches = [];
const noMatch = [];

for (const track of unmatched) {
  const trackVariant = getVariantType(track.title);
  const trackDur = track.duration_ms || 0;

  // For variant tracks, estimate what the original duration would be
  const targetDur = trackVariant === 'original' ? trackDur : estimateOriginalDuration(trackDur, trackVariant);

  // Also check for matching variant YouTube videos
  const ytVariant = (yt) => getVariantType(yt.title);

  let candidates = [];

  for (const yt of ytVideos) {
    if (yt.durationMs === 0) continue;

    const ytVar = ytVariant(yt);
    const titlePct = wordMatchPct(track.title, yt.title);

    // Also check artist name appears in YT title
    const artists = track.artist_name.split(',').map(a => a.trim().toLowerCase());
    const ytNorm = normalize(yt.title);
    let artistMatch = artists.some(a => ytNorm.includes(normalize(a)));

    // Duration comparison depends on variant matching
    let durDiff;
    if (trackVariant === ytVar) {
      // Same variant type: compare durations directly
      durDiff = Math.abs(trackDur - yt.durationMs);
    } else if (trackVariant !== 'original' && ytVar === 'original') {
      // Track is a variant, YT is original: compare estimated original duration
      durDiff = Math.abs(targetDur - yt.durationMs);
    } else if (trackVariant === 'original' && ytVar !== 'original') {
      // Track is original, YT is a variant: estimate what YT original would be
      durDiff = Math.abs(trackDur - estimateOriginalDuration(yt.durationMs, ytVar));
    } else {
      // Both are different variants: compare both estimated originals
      const trackOrig = estimateOriginalDuration(trackDur, trackVariant);
      const ytOrig = estimateOriginalDuration(yt.durationMs, ytVar);
      durDiff = Math.abs(trackOrig - ytOrig);
    }

    // Duration must be within tolerance for consideration
    const durWithinTolerance = durDiff <= DUR_TOLERANCE_MS;
    // Wider tolerance for variant↔original matching
    const variantTolerance = (trackVariant !== ytVar) ? DUR_TOLERANCE_MS * 2 : DUR_TOLERANCE_MS;
    const withinVariantTolerance = durDiff <= variantTolerance;

    if (!durWithinTolerance && !withinVariantTolerance) continue;

    // Score: title word match % + artist bonus + variant match bonus
    let score = titlePct * 60; // Max 60 from title words
    if (artistMatch) score += 20;
    if (trackVariant === ytVar) score += 15; // Bonus for matching variant type
    // Bonus for close duration match
    score += Math.max(0, (1 - durDiff / DUR_TOLERANCE_MS)) * 5;

    candidates.push({ yt, score, titlePct, durDiff, artistMatch, ytVar });
  }

  // Sort candidates by score descending
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (best && best.score >= 30 && best.titlePct >= 0.3) {
    matches.push({
      track,
      yt: best.yt,
      score: best.score,
      titlePct: best.titlePct,
      durDiff: best.durDiff,
      variant: trackVariant,
      ytVariant: best.ytVar,
    });
  } else {
    noMatch.push({
      track,
      variant: trackVariant,
      best: best || null,
    });
  }
}

console.log(`\n=== MATCHED: ${matches.length} tracks ===\n`);
for (const m of matches) {
  const durSec = Math.round(m.durDiff / 1000);
  const varTag = m.variant !== 'original' ? ` [${m.variant}]` : '';
  const ytVarTag = m.ytVariant !== 'original' ? ` [YT:${m.ytVariant}]` : '';
  console.log(`[${m.score.toFixed(0)}] "${m.track.title}" (${m.track.artist_name})${varTag}`);
  console.log(`    → ${m.yt.id} | ${m.yt.title}${ytVarTag} | title:${(m.titlePct*100).toFixed(0)}% dur:±${durSec}s`);
}

console.log(`\n=== NO MATCH: ${noMatch.length} tracks ===\n`);
for (const n of noMatch) {
  const varTag = n.variant !== 'original' ? ` [${n.variant}]` : '';
  const best = n.best ? `best: [${n.best.score.toFixed(0)}] title:${(n.best.titlePct*100).toFixed(0)}% dur:±${Math.round(n.best.durDiff/1000)}s | ${n.best.yt.id} | ${n.best.yt.title}` : 'no candidates within duration tolerance';
  console.log(`  "${n.track.title}" (${n.track.artist_name})${varTag} — ${best}`);
}

// Generate clean updates
const updates = matches.map(m => ({
  id: m.track.id,
  youtube_video_id: m.yt.id,
  youtube_url: `https://www.youtube.com/watch?v=${m.yt.id}`,
  youtube_thumbnail_url: `https://i.ytimg.com/vi/${m.yt.id}/hqdefault.jpg`,
  youtube_title: m.yt.title,
  youtube_is_manual: true,
}));

const { writeFileSync } = await import('fs');
writeFileSync(new URL('./yt_updates_v2.json', import.meta.url), JSON.stringify(updates, null, 2));
console.log(`\nWrote ${updates.length} updates to scripts/yt_updates_v2.json`);
