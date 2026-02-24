# Baseline Report — v0.00.65 (Pre-Vision Infrastructure)

Captured: 2026-02-24 12:31 PST
Engine: Playwright WebKit (headless)
Server: localhost:8081 (Vite dev)

## Results

| Device | Result | Boot (s) | FPS avg | FPS min | FPS max | Quality | Errors |
|--------|--------|----------|---------|---------|---------|---------|--------|
| Desktop (960x540) | PASS | 16.6 | 19 | 18 | 20 | high→medium | 0 |
| iPhone Xs (812x375) | PASS | 5.9 | 32 | 31 | 33 | low | 0 |
| iPhone 12 Mini (780x360) | PASS | 5.7 | 24.6 | 23 | 29 | medium→low | 0 |

## Notes
- Desktop boots slower (16.6s vs ~6s mobile) because full assets loaded at higher resolution
- Desktop quality drops from high→medium during gameplay (PerfSystem adaptive)
- 12 Mini starts medium, drops to low at 6.2s (PerfSystem adaptive)
- Xs stays low throughout (starts low from phone-high tier)
- 12 Mini console shows `WebGL: INVALID_VALUE: glTexImage2DRobustANGLE` — texture too large for sim viewport
- All 3 devices: 0 page errors, clean boot→title→playing flow

## Reference Screenshots
- `desktop_*_{01-06}` — loaded, init, title, playing, playing_10s, final
- `iphone-xs_*_{01-06}` — same 6 states
- `iphone-12-mini_*_{01-06}` — same 6 states

## What This Measures
- Boot time (BIOS → Title → Playing)
- FPS stability over 15s gameplay
- Quality tier changes (PerfSystem adaptive downgrade)
- Console errors and page crashes
- Visual state at 6 key game moments
