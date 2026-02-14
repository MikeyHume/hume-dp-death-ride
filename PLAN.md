# DP Moto — Full Build Plan

## Overview
Phaser 3 arcade motorcycle runner. Lone biker blasts left-to-right across a barren highway, weaving vertically to dodge obstacles while managing speed via Space tapping. Short intense runs (30-90s), instant restarts, score-chasing focused.

**Tech:** Phaser 3, TypeScript, Vite
**Resolution:** 1280x720, Scale.FIT
**Target:** 60 FPS, object pooling, no per-frame allocations

---

## Phase 1: Core Movement Prototype ← CURRENT
**Goal:** Nail the feel. Orange rectangle, mouse Y control, Space tapping for speed, debug lines.

**Movement model:**
- **Vertical (Y):** Mouse Y directly sets bike Y (clamped to road bounds). No inertia.
- **Horizontal (X):** Bike stays at fixed X by default. Space tapping pushes right. Obstacle hits push left. No passive drift.
- **X friction:** After Space impulse, X velocity decays (bike stops moving right, doesn't snap back).
- **Death:** X reaches left boundary (too slow) or right boundary (too fast).

**Files:**
- `src/systems/InputSystem.ts` — mouse Y, Space tap, attack stub
- `src/systems/PlayerSystem.ts` — direct Y, X impulse/friction, death, `applyLeftwardPush()`
- `src/config/tuning.ts` — all constants centralized
- `src/scenes/GameScene.ts` — wire systems, debug boundary lines, debug text

**Verify:** Mouse Y tracks directly. Space nudges right. Friction settles. No tap = stays put. Boundaries = death.

---

## Phase 2: Fixed Road + Bounds
**Goal:** Scrolling road visuals replace debug lines. Speed tied to scroll rate.

**Files:**
- `src/systems/RoadSystem.ts` — TileSprite road, scrolling dashed center line, white edge lines
- Modify `src/scenes/BootScene.ts` — generate placeholder textures via `generateTexture()`
- Modify `src/scenes/GameScene.ts` — wire RoadSystem, add speed HUD text

**Verify:** Road scrolls left at variable speed. Lines scroll in sync. Speed is visually readable.

---

## Phase 3: Obstacle Spawning + Collisions
**Goal:** Obstacles spawn right, scroll left. Crash = death. Slow = push bike left. Object pooling.

**Files:**
- `src/systems/ObstacleSystem.ts` — Phaser Group pool (maxSize 50). CRASH (red) and SLOW (blue) types. Min vertical gap enforcement. Manual AABB collision.
- `src/systems/DifficultySystem.ts` — timer-based 0→1 ramp over 120s. Controls spawn rate and density.
- Modify `src/scenes/BootScene.ts` — obstacle placeholder textures
- Modify `src/config/tuning.ts` — obstacle/difficulty constants
- Modify `src/scenes/GameScene.ts` — wire systems, collision handling

**Verify:** Red kills. Blue pushes left. No impassable walls. Density ramps over time.

---

## Phase 4: Score + Restart Loop
**Goal:** Title → Play → Death → Score → instant restart.

**Files:**
- `src/systems/ScoreSystem.ts` — distance + speed multiplier scoring
- `src/config/gameMode.ts` — GameState enum (TITLE, PLAYING, DEAD)
- Modify `src/scenes/GameScene.ts` — state machine, title/death screens, HUD, `.reset()` on restart

**Verify:** Full loop works. Restart < 1 second. Score reflects distance + speed.

---

## Phase 5: Juice Pass
**Goal:** Speed lines, camera shake, screen flash, edge warnings, procedural audio.

**Files:**
- `src/systems/FXSystem.ts` — speed lines (pre-allocated), flash, shake, edge warning overlays
- `src/systems/AudioSystem.ts` — Web Audio procedural sounds (engine oscillator, impact bursts)
- Modify `src/config/tuning.ts` — FX constants
- Modify `src/scenes/GameScene.ts` — wire FX/Audio, trigger on events

**Verify:** Speed lines at high speed. Shakes on hits. Edge warnings visible. Deaths feel impactful.

---

## Phase 6: Weekly Seed + Local Leaderboard
**Goal:** Deterministic obstacle patterns per ISO week. localStorage leaderboard.

**Files:**
- `src/util/time.ts` — `getCurrentWeekKey()` returns "YYYY-W##"
- `src/util/rng.ts` — SeededRNG (mulberry32)
- `src/systems/LeaderboardSystem.ts` — localStorage CRUD, top 10 per week
- Modify `src/systems/ObstacleSystem.ts` — use seeded RNG
- Modify `src/scenes/GameScene.ts` — leaderboard on death screen

**Verify:** Same seed = same patterns. Scores persist per week. New week = new patterns.

---

## Phase 7: Optional Katana
**Goal:** Press F to slash. Destroys green destructible obstacles for bonus score.

**Files:**
- `src/systems/ProjectileSystem.ts` — slash window (0.15s) + cooldown (0.5s), hitbox
- Modify `src/systems/InputSystem.ts` — F key
- Modify `src/systems/ObstacleSystem.ts` — DESTRUCTIBLE type (green), slash collision
- Modify `src/config/tuning.ts` — katana constants

**Verify:** F = slash. Green destroyed on hit. Score bonus. Cooldown works. Game playable without katana.

---

## Architecture Decisions
- **Plain class systems** — lightweight, trivial to reset, deterministic update order
- **Manual AABB collision** — no Phaser physics needed
- **All constants in `tuning.ts`** — single source of truth, hot-reloadable
- **Placeholder art via `generateTexture()`** — swap for real assets later in BootScene only
- **Delta time in seconds** — `delta / 1000` once in GameScene.update()
- **No per-frame allocations** — pre-allocated arrays, reused objects, indexed for loops

## Acceptance Checklist
- [ ] Mouse movement feels smooth and precise
- [ ] Speed tapping is readable and risky
- [ ] Left/right screen deaths feel fair
- [ ] Obstacles always readable
- [ ] Restart is instant
- [ ] Game is fun in under 60 seconds
