# DP Moto — iOS Safari Bug Report
**Generated: 2026-02-23**
**Version: v0.00.46**
**Target: iPhone Xs (A12, iOS 18.7.5, Safari 18.7.4)**

---

## Priority 1 (CRITICAL) — Game Crashes Within 1 Second

**Symptom:** Safari tab crashes (dies completely) within 1 second of page load on iPhone Xs. Affects both dev mode (port 8081, ESM) and production build (port 8082, bundled). The crash is 100% reproducible — happens every single time.

**Confirmed NOT the cause:**
- WebGL / GPU capability (Phaser 3.90 from CDN runs 60 FPS at 1920x1080 with 200 objects)
- Canvas resolution (1920x1080 verified working)
- Device hardware (iPhone Xs A12 handles Phaser fine)
- Network/asset loading (CDN tests load assets without issue)
- Phaser version (3.88 and 3.90 both work from CDN)

**Root cause analysis:**
The initial JS payload was 591KB of game code that all evaluated synchronously during the first second:
- GameScene (158KB source, 5068 lines) and its 30+ system imports
- Supabase SDK (~174KB bundled)
- Three WebGL shader pipelines
- All evaluated before a single frame renders

iOS Safari likely kills the tab due to CPU/memory pressure from parsing + evaluating this much JS during the initial page load, combined with simultaneous Phaser game creation and asset loading.

**Fix applied (v0.00.45-46):**
1. **Dynamic import GameScene + pipelines** — Initial payload reduced from 591KB to **52KB** (91% reduction)
2. **Dynamic import AuthSystem/Supabase** — Deferred another 174KB to BootScene create phase
3. **Disabled CRT shader on phone-low** — A12 chip can't handle 15+ texture lookups per fragment
4. Code splitting creates 6 chunks loaded on demand:
   - `index.js` (52KB) — immediate
   - `AuthSystem.js` (174KB) — during BootScene create
   - `GameScene.js` (351KB) — parallel with boot
   - `CRTPipeline.js` (12KB) — parallel
   - `WaterDistortionPipeline.js` (3.5KB) — parallel
   - `DamageFlashPipeline.js` (3.7KB) — parallel

**Status:** Fix implemented, needs iPhone testing. The Mac is currently unreachable (SSH timeout on both known IPs).

**Test plan:**
1. Start safaridriver on the Mac
2. Create iPhone WebDriver session with `platformName: "iOS"` (top-level)
3. Navigate to `http://192.168.1.150:8081/` (dev mode)
4. Monitor for >3 seconds survival (previously crashed at 1s)
5. If stable, navigate to `http://192.168.1.150:8082/` (production build)
6. Run full game flow: BIOS → Title → Tutorial → Countdown → Play → Die → Leaderboard

---

## Priority 2 (HIGH) — Desktop Controls Shown on Mobile

**Symptom:** Mobile players see keyboard/mouse instructions they can't use.

**Instances found:**
| Location | Desktop Text | Mobile Fix (applied) |
|----------|-------------|---------------------|
| GameScene.ts:1034 | "HOLD SPACEBAR TO GO" | "TAP AND HOLD TO GO" |
| GameScene.ts:764 | "Press SPACEBAR to try again" | "Tap to try again" |
| GameScene.ts:4932 | "SPACE = Play Again \| ESC = Song Select" | "Tap = Play Again \| Back = Song Select" |

**Status:** Fixed in v0.00.46. All three locations now check `GAME_MODE.mobileMode`.

---

## Priority 3 (MEDIUM) — Tutorial Images Show Desktop Controls

**Symptom:** Tutorial sprite images are pre-rendered with desktop controls (mouse movement, keyboard shortcuts). On mobile, these images show instructions the player can't follow.

**Files affected:**
- `assets/tutorial/controls_v4/controls_v4__00000.jpg` (loaded as static frame on mobile)
- `assets/tutorial/tut_v2/rules_v2.jpg`
- `assets/tutorial/tut_v2/rage_v2/rage_v2_0.jpg`

**Status:** Unfixed. Requires new tutorial images designed for touch controls, or a text overlay that replaces the desktop instructions with mobile equivalents.

---

## Priority 4 (LOW) — CRT Shader Disabled on Phone-Low

**Symptom:** iPhone Xs (and similar A12/A13 phones) no longer get the CRT post-processing effect. This was intentionally disabled because the CRT shader has 15+ texture lookups, 29 uniforms, and a 9x9 bloom kernel — too heavy for the A12 GPU at 1920x1080.

**Impact:** Visual downgrade on older iPhones. Desktop, tablets, and A14+ phones still get CRT.

**Future fix:** Create a simplified CRT shader for phone-low (reduce bloom to 3x3, remove barrel distortion, fewer texture lookups).

---

## Priority 5 (LOW) — Performance (FPS) Needs Measurement

**Observation from Mac Safari:** Game runs at ~30 FPS (half of 60 target). This was noted during desktop Safari testing but needs measurement on iPhone Xs after the crash fix.

**Status:** Needs iPhone testing. The previous session confirmed 22-28 FPS on iPhone Xs with CRT enabled — with CRT now disabled on phone-low, FPS should improve.

---

## Diagnostic Tools Created

| File | Purpose |
|------|---------|
| `public/test-ios-diagnose.html` | 7-step diagnostic isolating each potential crash cause |
| `public/test-stepwise.html` | Step-by-step module import test (loads game modules one by one) |
| `public/test-minimal.html` | Basic WebGL/canvas test (confirmed working on iPhone) |
| `public/test-phaser-only.html` | Phaser CDN minimal game (confirmed 60 FPS on iPhone) |
| `public/test-progressive.html` | Progressive complexity test levels 1-10 (confirmed working) |

---

## Device Profile Summary

| Tier | CRT | Reflections | Cars | Parallel | Devices |
|------|-----|-------------|------|----------|---------|
| Desktop | ON | ON | 5 | 32 | Windows/Mac |
| Tablet | ON | ON | 5 | 4 | iPad |
| Phone High | ON | ON | 3 | 2 | iPhone 12+ |
| Phone Low | **OFF** | OFF | 0 | 2 | iPhone Xs, XR, 11 |

---

## Next Steps

1. **Get Mac online** — Reconnect SSH to test on real iPhone
2. **Run safaridriver** — Must run under the GUI user account
3. **Test v0.00.46** on iPhone Xs — Verify 1-second crash is fixed
4. **Measure FPS** — Check framerate without CRT on phone-low
5. **Test iPhone 12 Mini** — Mikey's phone, previously crashed during BIOS
6. **Deploy to Vercel** — Push to GitHub for public testing
