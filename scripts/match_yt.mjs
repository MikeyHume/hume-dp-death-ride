// Match YouTube videos to unmatched Supabase tracks and generate update commands
import { readFileSync } from 'fs';

const unmatched = JSON.parse(readFileSync(new URL('./unmatched.json', import.meta.url), 'utf8'));

// All YouTube videos scraped from channels/playlists
const ytVideos = [
  // === ANGELBABY (@wearehume) ===
  { id: 'Huzy1PlVqvY', title: 'angelbaby - surrender (official visualizer)' },
  { id: 'Sr3zk8IvwtA', title: 'wayside - angelbaby (official visualizer)' },
  { id: 'Mx7rB4wenig', title: 'god made me like this feat. Bryce Vine (Official Visualizer)' },
  { id: 'WJcLp4OhLmk', title: 'angelbaby x RudyWade - dark mode (Official Visualizer)' },
  { id: 'z185z1zvaUI', title: 'angelbaby - endless summer (official visualizer)' },
  { id: '0AeK8FQlrJg', title: 'Imposter Feat. VOILÀ' },
  { id: 'hV5Zc1eYwpk', title: 'angelbaby - nothing really matters (Official Visualizer)' },
  { id: 'PgXh3kHjJUc', title: 'angelbaby - black hole feat. TK (Official Visualizer)' },
  { id: 'zyldzSEayAM', title: 'angelbaby - grinch on christmas (Official Visualizer)' },
  { id: '-OkICR9jEXw', title: 'angelbaby - new location (Official Visualizer)' },
  { id: '6X-cxA2F6rY', title: 'angelbaby - minted (feat. Brandyn Burnette)' },
  { id: 'fz5ZlzXk22Q', title: 'angelbaby - what happens when we die (Official Visualizer)' },
  { id: 'CWTMI6WU4aM', title: 'angelbaby - walking dead (Official Visualizer)' },
  { id: 's5FqXsOQoDo', title: 'feel good inc. (Official Visualizer)' },
  { id: 'GlxH3AgYwfE', title: "i'm fine :(: Feat. GrimesAI (Official Lyric Video)" },
  { id: 'bwrX8e797LA', title: 'angelbaby - i broke time (Official Visualizer)' },
  { id: 'wxskFdcAjhU', title: 'angelbaby - am i just high? (Official Visualizer)' },
  { id: 'Y9vm_C3tZYA', title: 'life is good Feat. Jagwar Twin (Official Visualizer)' },
  { id: 'DJ-cAFtnsl8', title: 'angelbaby - before you Feat. PRETTYMUCH (Official Music Video)' },
  { id: 'QxQOvlbicwc', title: 'angelbaby - live forever Feat. Blvck Svm (Official Visualizer)' },
  { id: 'COvEMqLd3ys', title: 'angelbaby - before you (Night Tales Remix) Feat. PRETTYMUCH [Official Visualizer]' },
  { id: 'L4EI5jNCK8U', title: 'angelbaby - before you Feat. PRETTYMUCH (Oliver Nelson Remix) [Official Visualizer]' },
  { id: 'RLyssoC-TBs', title: 'angelbaby - before you Feat. PRETTYMUCH (Official Visualizer)' },
  { id: 'qmtO4ZRcO6s', title: 'angelbaby - view from the moon Feat. Stolar (Official Lyric Video)' },
  { id: 'TGyHK5hB_VA', title: 'angelbaby - the otherside feat. Gino The Ghost (Official Lyric Video)' },

  // === DEATHPIXIE (@DEATHPIXIEXX channel + playlist) ===
  { id: 'GZwNZU7AviA', title: 'DEATHPIXIE - HELL GIRL' },
  { id: 'D7ElUaefW1I', title: 'DEATHPIXIE - LIL B*TCH' },
  { id: 'SbDLNQwEnpo', title: 'DEATHPIXIE - KAWASAKI (Official Visualizer)' },
  { id: '2MRkm7r5Rcw', title: 'DEATHPIXIE - SAFE WORD (Official Visualizer)' },
  { id: 'T_Tiljs1xfE', title: 'DEATHPIXIE - WALKING NIGHTMARE (Official Visualizer)' },
  { id: 'G06y_xIueq8', title: 'DEATHPIXIE - DOMINATRIX (Official Visualizer)' },
  { id: 'Ep-4MxSc5A8', title: 'DEATHPIXIE - GAS ON FIRE (Official Visualizer)' },
  { id: 'Va-lOq3Ouvo', title: 'DEATHPIXIE - ATE (Official Visualizer)' },
  { id: 'LvM7VMZv7lo', title: 'DEATHPIXIE - MORE COWBELL' },
  { id: '2m6eyeSIqwE', title: 'DEATHPIXIE - TOKYO BLOOD (HALLOWEEN SPECIAL)' },
  { id: 'HJZUysC9AQc', title: 'DEATHPIXIE - MATAR #9 KTB (Official Visualizer)' },
  { id: 'sBK0gxdpsVg', title: 'DEATHPIXIE - BLOOD BEAT (Official Visualizer)' },
  { id: 'vPPe7euYsac', title: 'DEATHPIXIE - MERRY DEATHMAS' },
  { id: 'OoGzRZDxBW8', title: 'DEATHPIXIE - NOSFERATU' },
  { id: 'SZFMIoIWTDo', title: 'DEATHPIXIE - SLIP (Official Visualizer)' },
  { id: '-Etrcda6FdA', title: 'DEATHPIXIE - DEATH MACHINE' },
  { id: 'N2GIsZm4NJo', title: 'DEATHPIXIE - HENTAI (Official Visualizer)' },
  { id: 'Q9SgN4vsWGI', title: 'DEATHPIXIE - KILLAMONSTA (Official Visualizer)' },
  { id: 'bS9LPddZgUU', title: 'MAIN CHARACTER ENERGY - DEATHPIXIE (OFFICIAL VISUALIZER)' },
  { id: 'bJNTqMea4Jo', title: 'OKINAWA - DEATHPIXIE (OFFICIAL VISUALIZER)' },
  // Sped up / slowed versions from channel
  { id: 'uGoTN0lA_ic', title: 'DEATHPIXIE - DEATH MACHINE (SPED UP)' },
  { id: 'aVqKe8pI7Hg', title: 'DEATHPIXIE - DEATH MACHINE (SLOWED & REVERBED)' },
  { id: 'FH93Lu64bK8', title: 'DEATHPIXIE - SLIP (SPED UP)' },
  { id: 'aNQIS1oIL4w', title: 'DEATHPIXIE - SLIP (SLOWED & REVERBED)' },
  { id: '_fehq6Mbs1c', title: 'DEATHPIXIE - MERRY DEATHMAS (SPED UP)' },
  { id: 'cVfhGGfLEoY', title: 'DEATHPIXIE - MERRY DEATHMAS (SLOWED & REVERBED)' },
  // Collab tracks
  { id: 'EkPDn519DFs', title: 'DEATHPIXIE, deadmau5 - RAISE YOUR WEAPON (DEATHPIXIE\'S REQUIEM)' },
  { id: '_uY2wYHkR-k', title: 'DEATHPIXIE - SAFE WORD (DEATHMIX WITH LEXY PANTERRA)' },
  { id: 'NtqadXKl_PA', title: 'DIE & LIVE AGAIN (FEAT. MERYLL)' },
  { id: 'p2hVGRtwEsU', title: 'DEATHPIXIE x CYPARISS - NIGHTMARECORE' },
  { id: 'EydIMHsDhOA', title: 'HELL GIRL II - DEATHPIXIE x OddKidOut (OFFICIAL MUSIC VIDEO)' },
  { id: 'zadRpdHMD-c', title: 'GRIM REAPER - DEATHPIXIE & PRO6LEMA' },
  { id: 'LU7P-1WxFGI', title: 'DEATHPIXIE x RezaDead - BRAIN ROT' },
  { id: '83ATuZcDV_4', title: 'DIGITAL KILL SHIT - DEATHPIXIE x RezaDead' },
  { id: 'INZDg2xONjc', title: 'WELCOME TO THE FREAKSHOW - DEATHPIXIE x T78' },
  { id: 'cn5WWKl_ueU', title: 'PHONK TECHNO - DEATHPIXIE x WHIPPED CREAM (OFFICIAL VISUALIZER)' },

  // === PRO6LEMA (@Pro6lemaaa) ===
  { id: 'd1aaVprdnoE', title: 'Pro6lema x HXDES - All Eyes on Rani' },
  { id: '4JZ3M2WVdAQ', title: 'Pro6lema - Vida' },
  { id: 'JQ5PYJWENY4', title: 'Pro6lema - Que Perigx' },
  { id: 'yWBKP5Qweoc', title: 'FEITIÇO_99 - Pro6lema' },
  { id: 'YNoN6AaKBwM', title: 'Pro6lema - Trancemelodia' },
  { id: 'YpAif61NpbM', title: 'Pro6lema - Breja Breja' },
  { id: 'ZmXK53tAi4k', title: 'Pro6lema - Minion Brain Rot' },
  { id: 'AfMH-mccKVQ', title: 'Pro6lema - Hoje em Dia é Difícil Encontrar' },
  { id: 'z_0PzMBnlf8', title: 'Pro6lema - Menina Feat. DEATHPIXIE' },

  // === KAI.WAV (@kai.wav__) ===
  { id: 'pD_Z-zv-BXU', title: "kai.wav - that's a vibe (official visualizer)" },
  { id: 'pWJZrUufHGU', title: 'Kai.wav - funKtion (Official Visualizer)' },
  { id: 'jFl8ydvt36U', title: 'Kai.wav x Aloe Blacc - I need a Dollar (Tiago Ribeiro Remix)' },
  { id: 'g0BOY5iNF4U', title: 'Kai.wav - Love in the Music (Official Music Visualizer)' },
  { id: 'j8h8jpM6-qQ', title: 'Aloe Blacc x Kai.wav - I Need a Dollar (Official Lyric Video)' },
];

function normalize(s) {
  return s.toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCore(title) {
  // Remove common suffixes like (Official Visualizer), sped up, slowed, etc
  return normalize(title)
    .replace(/\b(official|visualizer|music video|lyric video|halloween special|christmas special|feat\.?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Build matches
const matches = [];
const noMatch = [];

for (const track of unmatched) {
  const trackTitle = normalize(track.title);
  const trackArtist = normalize(track.artist_name);

  // Check for slowed/sped/ultra variants
  const isSlowed = /slowed/i.test(track.title);
  const isSped = /sped up/i.test(track.title);
  const isUltra = /ultra slowed/i.test(track.title);

  let bestMatch = null;
  let bestScore = 0;

  for (const yt of ytVideos) {
    const ytNorm = normalize(yt.title);
    const ytCore = extractCore(yt.title);
    let score = 0;

    // Check if track title core appears in YT title
    // Strip variant suffixes from track title for core comparison
    let trackCore = trackTitle
      .replace(/\(slowed.*?\)/g, '').replace(/\(sped.*?\)/g, '').replace(/\(ultra.*?\)/g, '')
      .replace(/slowed.*reverbed/g, '').replace(/sped up/g, '').replace(/ultra slowed/g, '')
      .replace(/deathmix/g, '').replace(/feat\./g, '')
      .replace(/\s+/g, ' ').trim();

    // Direct core title match
    if (ytCore.includes(trackCore) || trackCore.includes(ytCore)) {
      score += 50;
    } else {
      // Try individual significant words
      const trackWords = trackCore.split(' ').filter(w => w.length > 2);
      const ytWords = ytCore.split(' ');
      let wordMatches = 0;
      for (const tw of trackWords) {
        if (ytWords.some(yw => yw === tw || yw.includes(tw) || tw.includes(yw))) {
          wordMatches++;
        }
      }
      if (trackWords.length > 0) {
        score += (wordMatches / trackWords.length) * 40;
      }
    }

    // Check artist name match
    const artists = trackArtist.split(',').map(a => a.trim());
    for (const a of artists) {
      if (ytNorm.includes(a)) score += 15;
    }

    // Variant matching: both must agree on slowed/sped/none
    const ytSlowed = /slowed/i.test(yt.title);
    const ytSped = /sped up/i.test(yt.title);
    if (isSlowed && ytSlowed) score += 20;
    else if (isSped && ytSped) score += 20;
    else if (!isSlowed && !isSped && !isUltra && !ytSlowed && !ytSped) score += 10;
    else if ((isSlowed && !ytSlowed) || (isSped && !ytSped) || (!isSlowed && !isSped && (ytSlowed || ytSped))) {
      score -= 30; // Penalize variant mismatch
    }

    // Special cases
    if (track.title === 'SAFE WORD (Deathmix)' && yt.title.includes('DEATHMIX')) score += 30;
    if (track.title.includes('Night Tales Remix') && yt.title.includes('Night Tales')) score += 30;
    if (track.title.includes('Oliver Nelson Remix') && yt.title.includes('Oliver Nelson')) score += 30;
    if (track.title.includes('Tiago Ribeiro Remix') && yt.title.includes('Tiago Ribeiro')) score += 30;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = yt;
    }
  }

  // Threshold: only accept if score is high enough
  if (bestScore >= 40 && bestMatch) {
    matches.push({ track, yt: bestMatch, score: bestScore });
  } else {
    noMatch.push({ track, bestScore, bestMatch });
  }
}

console.log(`\n=== MATCHED: ${matches.length} tracks ===\n`);
for (const m of matches) {
  console.log(`[${m.score}] "${m.track.title}" (${m.track.artist_name})`);
  console.log(`    → ${m.yt.id} | ${m.yt.title}`);
}

console.log(`\n=== NO MATCH: ${noMatch.length} tracks ===\n`);
for (const n of noMatch) {
  const best = n.bestMatch ? `best: [${n.bestScore}] ${n.bestMatch.id} | ${n.bestMatch.title}` : 'no candidates';
  console.log(`  "${n.track.title}" (${n.track.artist_name}) — ${best}`);
}

// Output JSON for the matched tracks
const updates = matches.map(m => ({
  id: m.track.id,
  youtube_video_id: m.yt.id,
  youtube_url: `https://www.youtube.com/watch?v=${m.yt.id}`,
  youtube_thumbnail_url: `https://i.ytimg.com/vi/${m.yt.id}/hqdefault.jpg`,
  youtube_title: m.yt.title,
  youtube_is_manual: true,
}));

const { writeFileSync } = await import('fs');
writeFileSync(new URL('./yt_updates.json', import.meta.url), JSON.stringify(updates, null, 2));
console.log(`\nWrote ${updates.length} updates to scripts/yt_updates.json`);
