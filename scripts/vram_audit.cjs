/**
 * VRAM Audit Script — Catalogs every visual asset loaded by the game
 * and calculates uncompressed GPU texture size (width x height x 4 bytes RGBA).
 *
 * Usage: node scripts/vram_audit.cjs
 *
 * Outputs: scripts/vram_audit_results.json
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const PUBLIC = path.resolve(__dirname, '..', 'public');

// ──────────────────────────────────────────────────────────────
// All assets from BootScene.ts, organized by category and mode
// ──────────────────────────────────────────────────────────────

const assets = [];

function add(key, filePath, category, mode = 'all', type = 'image') {
  assets.push({ key, filePath, category, mode, type });
}

// ── Frame Sequences (desktop only) ──

// Title loop: 27 frames
for (let i = 0; i < 27; i++) {
  const idx = String(i).padStart(2, '0');
  add(`start-loop-${idx}`, `assets/start/start_loop/DP_Death_Ride_Title_Loop${idx}.jpg`, 'title-loop', 'desktop');
}

// Title start: 25 frames
for (let i = 0; i < 25; i++) {
  const idx = String(i).padStart(2, '0');
  add(`start-play-${idx}`, `assets/start/start_play/DP_Death_Ride_Title_Start${idx}.jpg`, 'title-start', 'desktop');
}

// Pre-start cutscene: 46 frames
for (let i = 0; i < 46; i++) {
  const idx = String(i).padStart(5, '0');
  add(`pre-start-${idx}`, `assets/cutscenes/pre_start/v02/pre_start_v02__${idx}.png`, 'pre-start-cutscene', 'desktop');
}

// Intro-to-tutorial cutscene: 27 frames (desktop)
for (let i = 0; i < 27; i++) {
  const idx = String(i).padStart(5, '0');
  add(`intro-tut-${idx}`, `assets/cutscenes/intro_to_tut/v3/intro_to_tut_v03__${idx}.jpg`, 'intro-tut-cutscene', 'desktop');
}

// ── Mobile-only frame sequences ──
add('start-loop-00 (mobile)', 'assets/start/start_loop/DP_Death_Ride_Title_Loop00.jpg', 'title-loop', 'mobile');
add('intro-tut-00000 (mobile)', 'assets/cutscenes/intro_to_tut/v3_mobile/intro_to_tut_v03__00000.jpg', 'intro-tut-cutscene', 'mobile');

// ── Player Spritesheets (desktop full-res) ──
add('player-ride', 'assets/dp_player/dp_moto_v03.png', 'player-spritesheet', 'desktop', 'spritesheet');
add('player-attack', 'assets/dp_player/dp_attack.png', 'player-spritesheet', 'desktop-not-lite', 'spritesheet');
add('player-start', 'assets/dp_player/dp_start.png', 'player-spritesheet', 'desktop-not-lite', 'spritesheet');
add('player-powered', 'assets/dp_player/dp_powered_up.png', 'player-spritesheet', 'desktop-not-lite', 'spritesheet');
add('player-speedup', 'assets/dp_player/dp_speed_up.png', 'player-spritesheet', 'desktop-not-lite', 'spritesheet');
add('player-rocket-launch', 'assets/dp_player/dp_rocket_lancher_v2.png', 'player-spritesheet', 'desktop-not-lite', 'spritesheet');

// ── Player Spritesheets (mobile half-res) ──
add('player-ride (mobile)', 'assets/dp_player/dp_moto_v03_mobile.png', 'player-spritesheet', 'mobile', 'spritesheet');
add('player-attack (mobile)', 'assets/dp_player/dp_attack_mobile.png', 'player-spritesheet', 'mobile-not-lite', 'spritesheet');
add('player-start (mobile)', 'assets/dp_player/dp_start_mobile.png', 'player-spritesheet', 'mobile-not-lite', 'spritesheet');
add('player-powered (mobile)', 'assets/dp_player/dp_powered_up_mobile.png', 'player-spritesheet', 'mobile-not-lite', 'spritesheet');
add('player-speedup (mobile)', 'assets/dp_player/dp_speed_up_mobile.png', 'player-spritesheet', 'mobile-not-lite', 'spritesheet');
add('player-rocket-launch (mobile)', 'assets/dp_player/dp_rocket_lancher_v2_mobile.png', 'player-spritesheet', 'mobile-not-lite', 'spritesheet');

// ── COL spritesheets (desktop) ──
add('player-collect-rocket', 'assets/COL/COL_rocket.png', 'col-spritesheet', 'desktop-not-lite', 'spritesheet');
add('player-collect-shield', 'assets/COL/COL_shield.png', 'col-spritesheet', 'desktop-not-lite', 'spritesheet');
add('player-collect-hit', 'assets/COL/COL_hit.png', 'col-spritesheet', 'desktop-not-lite', 'spritesheet');

// ── COL spritesheets (mobile) ──
add('player-collect-rocket (mobile)', 'assets/COL/COL_rocket_mobile.png', 'col-spritesheet', 'mobile-not-lite', 'spritesheet');
add('player-collect-shield (mobile)', 'assets/COL/COL_shield_mobile.png', 'col-spritesheet', 'mobile-not-lite', 'spritesheet');
add('player-collect-hit (mobile)', 'assets/COL/COL_hit_mobile.png', 'col-spritesheet', 'mobile-not-lite', 'spritesheet');

// ── Pickup/VFX spritesheets (desktop) ──
add('rocket-projectile', 'assets/pickups/rocket_Projectile.png', 'vfx-spritesheet', 'desktop', 'spritesheet');
add('pickup-rocket', 'assets/pickups/rocket pickup.png', 'pickup-spritesheet', 'desktop', 'spritesheet');
add('pickup-shield', 'assets/pickups/shield_pickup.png', 'pickup-spritesheet', 'desktop', 'spritesheet');
add('explosion', 'assets/vfx/vfx_explosion.png', 'vfx-spritesheet', 'desktop', 'spritesheet');
add('slash-vfx', 'assets/vfx/slash.png', 'vfx-spritesheet', 'desktop', 'spritesheet');
add('countdown', 'assets/start/countdown.png', 'ui-spritesheet', 'desktop', 'spritesheet');

// ── Pickup/VFX spritesheets (mobile) ──
add('rocket-projectile (mobile)', 'assets/pickups/rocket_Projectile_mobile.png', 'vfx-spritesheet', 'mobile', 'spritesheet');
add('pickup-rocket (mobile)', 'assets/pickups/rocket pickup_mobile.png', 'pickup-spritesheet', 'mobile', 'spritesheet');
add('pickup-shield (mobile)', 'assets/pickups/shield_pickup_mobile.png', 'pickup-spritesheet', 'mobile', 'spritesheet');
add('explosion (mobile)', 'assets/vfx/vfx_explosion_mobile.png', 'vfx-spritesheet', 'mobile', 'spritesheet');
add('slash-vfx (mobile)', 'assets/vfx/slash_mobile.png', 'vfx-spritesheet', 'mobile', 'spritesheet');
add('countdown (mobile)', 'assets/start/countdown_mobile.png', 'ui-spritesheet', 'mobile', 'spritesheet');

// ── Car spritesheets: 20 desktop, 20 mobile ──
for (let c = 1; c <= 20; c++) {
  const num = String(c).padStart(3, '0');
  add(`car-${num}`, `assets/cars/car_${num}.png`, 'car-spritesheet', 'desktop', 'spritesheet');
  add(`car-${num} (mobile)`, `assets/cars/car_${num}_mobile.png`, 'car-spritesheet', 'mobile', 'spritesheet');
}

// ── Background images ──
add('obstacle-crash', 'assets/obstacles/road_barrier_01.png', 'obstacle');
add('obstacle-reflection-alt', 'assets/obstacles/road_barrier_01_reflection_alt.png', 'obstacle');
add('puddle-tex', 'assets/background/puddle example.png', 'background');
add('road-img', 'assets/background/road.jpg', 'background', 'desktop');
add('road-img (mobile)', 'assets/background/road_mobile.jpg', 'background', 'mobile');
add('railing', 'assets/background/railing_dark.jpg', 'background', 'desktop');
add('railing (mobile)', 'assets/background/railing_dark_mobile.jpg', 'background', 'mobile');
add('sky-img', 'assets/background/sky.jpg', 'background');
add('buildings-back', 'assets/background/buildings_back_row_dark.png', 'background');
add('buildings-front', 'assets/background/buildings_Front_row_dark.png', 'background');
// buildings-big loads the same file as buildings-front on desktop (not-lite)
add('buildings-big', 'assets/background/buildings_Front_row_dark.png', 'background', 'desktop-not-lite');

// ── UI assets ──
add('spotify-text-logo', 'ui/spotify_text_logo_.png', 'ui');
add('sign-in', 'ui/sign_in.png', 'ui');
add('cursor', 'ui/cursor.png', 'ui');
add('crosshair', 'ui/crosshair.png', 'ui');
add('rocket-icon', 'assets/pickups/rocket_icon.png', 'ui');
add('rocket-icon-empty', 'assets/pickups/rocket_empty_icon.png', 'ui');
add('shield-icon', 'assets/pickups/shield_icon.png', 'ui');
add('shield-icon-empty', 'assets/pickups/shield_empty_icon.png', 'ui');
add('ui-music-menu', 'ui/music menu.png', 'ui');
add('ui-skip', 'ui/skip.png', 'ui');
add('ui-unmuted', 'ui/unmuted.png', 'ui');
add('ui-muted', 'ui/muted.png', 'ui');
add('ui-insta', 'ui/insta.png', 'ui');
add('default-avatar', 'assets/profiles/dp_anon_pic.jpg', 'ui');
add('add-pic-icon', 'ui/add_pic_icon.png', 'ui');

// ── Tutorial assets (desktop) ──
add('tutorial-skip', 'assets/tutorial/skip_v02.png', 'tutorial');
add('tutorial-blank', 'assets/tutorial/how_to_play_v2.jpg', 'tutorial', 'desktop');
add('tutorial-obstacles', 'assets/tutorial/tut_v2/rules_v2.jpg', 'tutorial', 'desktop');
for (let i = 0; i < 29; i++) {
  const idx = String(i).padStart(2, '0');
  const fileIdx = String(i).padStart(5, '0');
  add(`tutorial-controls-${idx}`, `assets/tutorial/controls_v4/controls_v4__${fileIdx}.jpg`, 'tutorial-controls', 'desktop');
}
for (let i = 0; i < 4; i++) {
  add(`tutorial-rage-${i}`, `assets/tutorial/tut_v2/rage_v2/rage_v2_${i}.jpg`, 'tutorial-rage', 'desktop');
}

// ── Tutorial assets (mobile) ──
add('tutorial-blank (mobile)', 'assets/tutorial/how_to_play_v2_mobile.jpg', 'tutorial', 'mobile');
add('tutorial-obstacles (mobile)', 'assets/tutorial/tut_v2/rules_v2_mobile.jpg', 'tutorial', 'mobile');
add('tutorial-controls-00 (mobile)', 'assets/tutorial/controls_v4_mobile/controls_v4__00000.jpg', 'tutorial-controls', 'mobile');
add('tutorial-rage-0 (mobile)', 'assets/tutorial/tut_v2/rage_v2_mobile/rage_v2_0.jpg', 'tutorial-rage', 'mobile');

// ── Procedurally generated textures (in create(), not loaded from disk) ──
// pickup-glow: 256x256
// shield-glow: 256x256
// rocket-lane-glow: 256x256
const proceduralTextures = [
  { key: 'pickup-glow', width: 256, height: 256, category: 'procedural', mode: 'all' },
  { key: 'shield-glow', width: 256, height: 256, category: 'procedural', mode: 'all' },
  { key: 'rocket-lane-glow', width: 256, height: 256, category: 'procedural', mode: 'all' },
];

// ──────────────────────────────────────────────────────────────
// Run the audit
// ──────────────────────────────────────────────────────────────

async function audit() {
  const results = [];
  let missing = [];

  for (const asset of assets) {
    const fullPath = path.join(PUBLIC, asset.filePath);
    if (!fs.existsSync(fullPath)) {
      missing.push({ key: asset.key, filePath: asset.filePath, mode: asset.mode });
      continue;
    }

    try {
      const meta = await sharp(fullPath).metadata();
      const w = meta.width;
      const h = meta.height;
      const vramBytes = w * h * 4; // RGBA uncompressed
      const vramMB = vramBytes / (1024 * 1024);
      const fileSize = fs.statSync(fullPath).size;
      const fileSizeMB = fileSize / (1024 * 1024);

      results.push({
        key: asset.key,
        filePath: asset.filePath,
        category: asset.category,
        mode: asset.mode,
        type: asset.type,
        width: w,
        height: h,
        vramBytes,
        vramMB: Math.round(vramMB * 1000) / 1000,
        fileSizeBytes: fileSize,
        fileSizeMB: Math.round(fileSizeMB * 1000) / 1000,
        compressionRatio: Math.round((vramBytes / fileSize) * 10) / 10,
      });
    } catch (err) {
      missing.push({ key: asset.key, filePath: asset.filePath, error: err.message });
    }
  }

  // Add procedural textures
  for (const tex of proceduralTextures) {
    const vramBytes = tex.width * tex.height * 4;
    results.push({
      key: tex.key,
      filePath: '(procedural — generated at runtime)',
      category: tex.category,
      mode: tex.mode,
      type: 'procedural',
      width: tex.width,
      height: tex.height,
      vramBytes,
      vramMB: Math.round((vramBytes / (1024 * 1024)) * 1000) / 1000,
      fileSizeBytes: 0,
      fileSizeMB: 0,
      compressionRatio: 0,
    });
  }

  // Sort by VRAM descending
  results.sort((a, b) => b.vramBytes - a.vramBytes);

  // ── Compute summaries ──

  // Desktop total (mode: all, desktop, desktop-not-lite)
  const desktopAssets = results.filter(r =>
    r.mode === 'all' || r.mode === 'desktop' || r.mode === 'desktop-not-lite'
  );
  const desktopVRAM = desktopAssets.reduce((sum, r) => sum + r.vramBytes, 0);

  // Mobile (not-lite) total (mode: all, mobile, mobile-not-lite)
  const mobileAssets = results.filter(r =>
    r.mode === 'all' || r.mode === 'mobile' || r.mode === 'mobile-not-lite'
  );
  const mobileVRAM = mobileAssets.reduce((sum, r) => sum + r.vramBytes, 0);

  // Mobile lite total (mode: all, mobile — excludes *-not-lite)
  const mobileLiteAssets = results.filter(r =>
    r.mode === 'all' || r.mode === 'mobile'
  );
  const mobileLiteVRAM = mobileLiteAssets.reduce((sum, r) => sum + r.vramBytes, 0);

  // Category breakdowns for desktop
  const categoryBreakdown = {};
  for (const r of desktopAssets) {
    if (!categoryBreakdown[r.category]) {
      categoryBreakdown[r.category] = { count: 0, vramBytes: 0, vramMB: 0 };
    }
    categoryBreakdown[r.category].count++;
    categoryBreakdown[r.category].vramBytes += r.vramBytes;
  }
  for (const cat of Object.values(categoryBreakdown)) {
    cat.vramMB = Math.round((cat.vramBytes / (1024 * 1024)) * 100) / 100;
  }

  const output = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalAssets: results.length,
      desktopVRAM_MB: Math.round((desktopVRAM / (1024 * 1024)) * 100) / 100,
      mobileVRAM_MB: Math.round((mobileVRAM / (1024 * 1024)) * 100) / 100,
      mobileLiteVRAM_MB: Math.round((mobileLiteVRAM / (1024 * 1024)) * 100) / 100,
      desktopAssetCount: desktopAssets.length,
      mobileAssetCount: mobileAssets.length,
      mobileLiteAssetCount: mobileLiteAssets.length,
    },
    categoryBreakdown_desktop: categoryBreakdown,
    assets: results,
    missing,
  };

  const outPath = path.join(__dirname, 'vram_audit_results.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nVRAM Audit Complete — ${results.length} assets cataloged`);
  console.log(`Output: ${outPath}`);
  console.log(`\n${'='.repeat(70)}`);
  console.log(`SUMMARY`);
  console.log(`${'='.repeat(70)}`);
  console.log(`Desktop VRAM:      ${output.summary.desktopVRAM_MB} MB (${desktopAssets.length} assets)`);
  console.log(`Mobile VRAM:       ${output.summary.mobileVRAM_MB} MB (${mobileAssets.length} assets)`);
  console.log(`Mobile Lite VRAM:  ${output.summary.mobileLiteVRAM_MB} MB (${mobileLiteAssets.length} assets)`);
  if (missing.length > 0) {
    console.log(`\nMISSING FILES: ${missing.length}`);
    for (const m of missing) console.log(`  - ${m.key}: ${m.filePath}`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`CATEGORY BREAKDOWN (Desktop)`);
  console.log(`${'='.repeat(70)}`);
  const cats = Object.entries(categoryBreakdown).sort((a, b) => b[1].vramBytes - a[1].vramBytes);
  for (const [cat, data] of cats) {
    console.log(`  ${cat.padEnd(25)} ${String(data.vramMB).padStart(10)} MB   (${data.count} assets)`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`TOP 30 ASSETS BY VRAM (sorted descending)`);
  console.log(`${'='.repeat(70)}`);
  for (const r of results.slice(0, 30)) {
    const dims = `${r.width}x${r.height}`;
    console.log(`  ${r.key.padEnd(40)} ${dims.padStart(12)}  ${String(r.vramMB).padStart(8)} MB  [${r.mode}] ${r.category}`);
  }
}

audit().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
