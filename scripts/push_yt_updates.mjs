// Push YouTube video matches to Supabase music_tracks table
import { readFileSync } from 'fs';

const updates = JSON.parse(readFileSync(new URL('./yt_updates_final.json', import.meta.url), 'utf8'));

const SUPABASE_URL = 'https://wdaljqcoyhselitaxaeu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkYWxqcWNveWhzZWxpdGF4YWV1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwNjI2MTQsImV4cCI6MjA4NjYzODYxNH0.6PP4Ar9jxMxtx5M3K9WHDBK6iNrjhrsxfQ4EkQFrNS4';

// Try one update first to check if anon key can write
async function testUpdate() {
  const first = updates[0];
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/music_tracks?id=eq.${first.id}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        youtube_video_id: first.youtube_video_id,
        youtube_url: first.youtube_url,
        youtube_thumbnail_url: first.youtube_thumbnail_url,
        youtube_title: first.youtube_title,
        youtube_is_manual: first.youtube_is_manual,
      }),
    }
  );
  console.log(`Test update: ${res.status} ${res.statusText}`);
  if (res.status !== 204) {
    const body = await res.text();
    console.log(`Response: ${body}`);
  }
  return res.status === 204;
}

async function pushAll() {
  let success = 0;
  let failed = 0;

  // Batch in groups of 10 for reasonable throughput
  for (let i = 0; i < updates.length; i++) {
    const u = updates[i];
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/music_tracks?id=eq.${u.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            youtube_video_id: u.youtube_video_id,
            youtube_url: u.youtube_url,
            youtube_thumbnail_url: u.youtube_thumbnail_url,
            youtube_title: u.youtube_title,
            youtube_is_manual: u.youtube_is_manual,
          }),
        }
      );
      if (res.status === 204) {
        success++;
      } else {
        const body = await res.text();
        console.error(`FAIL [${i}] ${u.id}: ${res.status} ${body}`);
        failed++;
      }
    } catch (err) {
      console.error(`ERROR [${i}] ${u.id}: ${err.message}`);
      failed++;
    }

    // Progress every 20
    if ((i + 1) % 20 === 0) {
      console.log(`Progress: ${i + 1}/${updates.length} (${success} ok, ${failed} fail)`);
    }
  }

  console.log(`\nDone: ${success} updated, ${failed} failed out of ${updates.length}`);
}

const canWrite = await testUpdate();
if (canWrite) {
  console.log('Anon key can write — pushing all updates...\n');
  await pushAll();
} else {
  console.log('\nAnon key cannot write to music_tracks. Need service role key.');
  console.log('Try: npx supabase functions invoke sync_music_catalog');
  console.log('Or ask user for the SERVICE_ROLE_KEY.');
}
