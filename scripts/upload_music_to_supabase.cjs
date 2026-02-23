/**
 * Upload all Rythem_Songs MP3 files to Supabase Storage bucket "music".
 * Run: node scripts/upload_music_to_supabase.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://wdaljqcoyhselitaxaeu.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkYWxqcWNveWhzZWxpdGF4YWV1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTA2MjYxNCwiZXhwIjoyMDg2NjM4NjE0fQ.h7h7GDrckezJDlczzQNOPvpU51HTzmRXUFTnDEtquSM';
const BUCKET = 'music';
const LOCAL_DIR = path.join(__dirname, '..', 'public', 'assets', 'audio', 'music', 'Rythem_Songs');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  const files = fs.readdirSync(LOCAL_DIR).filter(f => f.endsWith('.mp3'));
  console.log(`Found ${files.length} MP3 files to upload (${LOCAL_DIR})`);

  let ok = 0, fail = 0;
  const manifest = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const localPath = path.join(LOCAL_DIR, file);
    const storagePath = `Rythem_Songs/${file}`;
    const buffer = fs.readFileSync(localPath);
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(1);

    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    });

    if (error) {
      console.error(`  [${i+1}/${files.length}] FAIL (${sizeMB}MB): ${file} — ${error.message}`);
      fail++;
    } else {
      const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
      manifest.push({ name: file.replace('.mp3', ''), file, url: publicUrl });
      console.log(`  [${i+1}/${files.length}] OK   (${sizeMB}MB): ${file}`);
      ok++;
    }
  }

  // Write manifest
  const manifestPath = path.join(__dirname, 'hume_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`\nDone: ${ok} uploaded, ${fail} failed`);
  console.log(`Manifest: ${manifestPath}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
