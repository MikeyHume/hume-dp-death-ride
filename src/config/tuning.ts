export const TUNING = {
  // Display
  GAME_WIDTH: 1920,
  GAME_HEIGHT: 1080,

  // Road bounds (bottom half of screen)
  ROAD_TOP_Y: 480,
  ROAD_BOTTOM_Y: 1080,
  LANE_COUNT: 4,                   // number of horizontal lanes

  // Perspective scaling (further = smaller, closer = bigger)
  LANE_SCALES: [1.0, 1.03, 1.1, 1.4] as readonly number[],  // per-lane scale multipliers (top→bottom)
  PLAYER_SCALE_TOP: 1.0,           // player scale at road top Y
  PLAYER_SCALE_BOTTOM: 1.420,      // player scale at road bottom Y

  // Player sprite sheets
  PLAYER_FRAME_WIDTH: 702,        // px per frame in ride sprite sheet
  PLAYER_FRAME_HEIGHT: 590,       // px per frame in ride sprite sheet
  PLAYER_ANIM_FRAMES: 9,          // usable ride frames (5+4, last slot empty)
  PLAYER_RIDE_FPS: 12,            // framerate for ride loop animation
  PLAYER_ATTACK_FRAME_WIDTH: 821, // px per frame in attack sprite sheet
  PLAYER_ATTACK_FRAME_HEIGHT: 590,// px per frame in attack sprite sheet
  PLAYER_ATTACK_ANIM_FRAMES: 21,  // usable attack frames (4×5 + 1, last 3 empty)
  PLAYER_ATTACK_FPS: 30,          // framerate for attack animation
  PLAYER_ATTACK_OFFSET_X: 15,     // px to shift attack sprite right (align sword swing with ride pose)
  POWERED_FRAME_WIDTH: 1076,      // px per frame in powered-up sprite sheet
  POWERED_FRAME_HEIGHT: 697,      // px per frame in powered-up sprite sheet
  POWERED_ANIM_FRAMES: 18,        // total frames (6×3 grid)
  POWERED_LOOP_START: 14,         // first frame of the looping section (last 4 frames: 14-17)
  POWERED_FPS: 12,                // framerate for powered-up intro and loop animations
  POWERED_SCALE: 1.0,             // extra scale multiplier for powered-up sprite (1.0 = no change, 1.2 = 20% bigger)
  POWERED_OFFSET_X: 0,            // px horizontal offset for powered-up sprite (positive = right)
  POWERED_OFFSET_Y: 0,            // px vertical offset for powered-up sprite (positive = down)
  ROCKET_LAUNCHER_FRAME_WIDTH: 802,  // px per frame in rocket launcher sheet (4010 / 5 cols)
  ROCKET_LAUNCHER_FRAME_HEIGHT: 488, // px per frame in rocket launcher sheet (1952 / 4 rows)
  ROCKET_LAUNCHER_ANIM_FRAMES: 20,   // total frames (5×4 grid)
  ROCKET_LAUNCHER_FIRE_FRAME: 5,     // 0-based frame index when rocket actually fires (6th frame)
  ROCKET_LAUNCHER_FPS: 12,            // framerate for rocket launcher animation
  ROCKET_LAUNCHER_SCALE: 1.13,        // scale multiplier for rocket launcher sprite
  ROCKET_LAUNCHER_OFFSET_X: 4,      // px horizontal offset for rocket launcher sprite (positive = right)
  ROCKET_LAUNCHER_OFFSET_Y: -10,      // px vertical offset for rocket launcher sprite (positive = down)
  ROCKET_EMIT_X: 0,                  // px offset from player X for rocket spawn (positive = right)
  ROCKET_EMIT_Y: -69,                  // px offset from player Y for rocket spawn (positive = down)
  SPEEDUP_FRAME_WIDTH: 655,       // px per frame in speed-up sprite sheet (2620 / 4 cols)
  SPEEDUP_FRAME_HEIGHT: 469,      // px per frame in speed-up sprite sheet (7504 / 16 rows)
  SPEEDUP_INTRO_END: 35,          // last frame of intro sequence (frames 0-35)
  SPEEDUP_LOOP_START: 36,         // first frame of loop sequence
  SPEEDUP_LOOP_END: 51,           // last frame of loop sequence (frames 36-51)
  SPEEDUP_OUTRO_START: 52,        // first frame of outro sequence
  SPEEDUP_OUTRO_END: 63,          // last frame of outro sequence (frames 52-63)
  SPEEDUP_FPS: 24,                  // framerate for speed-up intro/loop/outro animations
  SPEEDUP_SCALE: 1.08,              // extra scale multiplier for speed-up sprite (1.0 = no change)
  SPEEDUP_OFFSET_X: -6,             // px horizontal offset for speed-up sprite (positive = right)
  SPEEDUP_OFFSET_Y: 6,             // px vertical offset for speed-up sprite (positive = down)
  SPEEDUP_NO_TAP_TIMEOUT: 1.0,    // seconds after last tap before playing outro

  // Player dimensions and appearance
  PLAYER_DISPLAY_HEIGHT: 165,    // sprite scaled so height = this; width auto from aspect ratio
  PLAYER_COLLISION_W: 200,        // player hitbox full width (ellipse, fits motorcycle length)
  PLAYER_COLLISION_H: 6,         // player hitbox full height (ellipse, thin at tire base)
  PLAYER_COLLISION_OFFSET_Y: 80, // px to shift collision circle down (centered on tire base)
  PLAYER_TOP_Y_EXTEND: 40,  // px the player can travel above ROAD_TOP_Y

  PLAYER_ARROW_SPEED: 600,   // px/sec vertical movement when using arrow keys
  PLAYER_MOUSE_FOLLOW_RATE: 15, // exponential approach rate for mouse Y tracking (higher = snappier, 15 ≈ 95% in 0.2s)

  // Player horizontal position — edit these to move the left/right death boundaries
  PLAYER_START_X: 960,       // where the bike spawns horizontally (960 = center of 1920)
  PLAYER_MIN_X: 0,           // left death boundary (0 = left screen edge)
  PLAYER_MAX_X: 1920,        // right death boundary (1920 = right screen edge)

  // Road speed — increases over time
  ROAD_BASE_SPEED: 690,      // starting road scroll speed (px/sec)
  ROAD_SPEED_RAMP: 15,       // road speed increase per second of elapsed time (px/sec²)

  // Player speed model — smooth multiplier-based system
  // speedMultiplier ranges from 0 (stopped) to MAX_SPEED_MULTIPLIER (4x road speed)
  // At 1.0: player matches road speed. Below 1.0: drifts left. Above 1.0: moves right.
  MAX_SPEED_MULTIPLIER: 4.0,    // max speed = this × road speed (fast tapping cap)
  HOLD_MULTIPLIER: 1.0,         // target multiplier when holding space (match road)
  RELEASE_GRACE: 0.1,          // seconds to maintain speed after releasing space before decel
  DECEL_RATE: 1.5,              // exponential decay rate for deceleration (higher = faster)
  ACCEL_RATE: 8.0,              // exponential approach rate for acceleration (higher = snappier)
  ACCEL_DOWN_RATE: 2.0,         // rate multiplier slows back from tap-boost to hold speed
  TAP_PRESSURE_PER_TAP: 0.25,  // each tap adds this to tap pressure (maps to multiplier boost)
  TAP_PRESSURE_DECAY: 2.0,     // tap pressure decays per second (stop tapping = pressure fades)
  TAP_PRESSURE_MAX: 1.0,       // max tap pressure (at max: multiplier = MAX_SPEED_MULTIPLIER)

  // Obstacles — crash (red, compact, instant death)
  CRASH_WIDTH: 50,
  CRASH_HEIGHT: 50,
  CRASH_COLOR: 0xff0000,
  OBSTACLE_DISPLAY_SCALE: 0.85, // visual scale for crash/slow obstacles (collision unchanged)
  OBSTACLE_SPAWN_MARGIN: 120,   // spawn this far off-screen right

  // Obstacles — slow (blue, tile-based zone, continuous slowdown while overlapping)
  SLOW_TILE_SIZE: 80,              // square base unit for slow obstacles
  SLOW_MIN_TILES: 1,              // minimum length in tiles
  SLOW_MAX_TILES: 16,             // maximum length in tiles (16 × 80 = 1280px)
  SLOW_COLOR: 0x0066ff,
  SLOW_PUSH_RATE: 1200,           // player speed reduced per second while overlapping

  // Obstacles — car (animated sprites, instant death, moves slower than road)
  CAR_COUNT: 20,                    // number of car sprite sheets
  CAR_FRAME_WIDTH: 441,             // px per frame in sprite sheet
  CAR_FRAME_HEIGHT: 186,            // px per frame in sprite sheet
  CAR_ANIM_FRAMES: 59,              // usable frames per sheet (61 total, last 2 empty)
  CAR_SPEED_FACTOR: 0.65,           // cars travel at this fraction of road speed (scroll left slower)
  CAR_DISPLAY_SCALE: 0.80,          // visual scale multiplier for car sprites (1.0 = fill lane)
  CAR_COLLISION_WIDTH_RATIO: 0.8,   // ellipse width = 8/10 of sprite width
  CAR_COLLISION_HEIGHT_RATIO: 0.667, // ellipse height = 2/3 of sprite height, bottom-aligned

  // Explosions (car-vs-crash collision)
  EXPLOSION_FRAME_SIZE: 440,       // px per frame in sprite sheet (square)
  EXPLOSION_ANIM_FRAMES: 7,       // frames in explosion sprite sheet
  EXPLOSION_DURATION: 7 / 12,     // seconds (7 frames at 12fps)

  // Obstacle spawning
  SPAWN_INTERVAL_MAX: 2.0,      // seconds between spawns at difficulty 0 (easiest)
  SPAWN_INTERVAL_MIN: 0.5,      // seconds between spawns at difficulty 1 (hardest)
  MAX_OBSTACLES_PER_WAVE: 3,    // max obstacles in a single spawn wave
  CRASH_CHANCE_BASE: 0.3,       // chance an obstacle is stationary crash type at difficulty 0
  CRASH_CHANCE_MAX: 0.5,        // chance an obstacle is stationary crash type at difficulty 1
  CAR_CHANCE_BASE: 0.15,        // chance an obstacle is a car at difficulty 0
  CAR_CHANCE_MAX: 0.3,          // chance an obstacle is a car at difficulty 1

  // Difficulty ramp
  DIFFICULTY_RAMP_DURATION: 120, // seconds to go from difficulty 0 to 1

  // Score
  SCORE_DISTANCE_RATE: 1,         // base score per second of survival
  SCORE_SPEED_MULTIPLIER: 0.002,  // bonus multiplier per unit of player speed (faster = more points)

  // FX — speed lines
  SPEED_LINE_COUNT: 20,            // pre-allocated horizontal speed lines
  SPEED_LINE_THRESHOLD: 0.8,       // speed lines appear when playerSpeed > roadSpeed * this
  SPEED_LINE_ALPHA_MAX: 0.6,       // max alpha of speed lines at full intensity
  SPEED_LINE_SCROLL: 4.0,          // speed lines travel left at this multiple of road speed
  SPEED_LINE_COLOR: 0xffffff,

  // FX — camera shake
  SHAKE_DEATH_DURATION: 300,       // ms
  SHAKE_DEATH_INTENSITY: 0.02,
  SHAKE_SLOW_DURATION: 100,        // ms — brief shake when entering a slow zone
  SHAKE_SLOW_INTENSITY: 0.005,

  // FX — screen flash
  FLASH_DEATH_DURATION: 200,       // ms — white flash on death
  FLASH_DEATH_COLOR: 0xff0000,

  // FX — death exposure transition
  DEATH_RAMP_DURATION: 0.5,        // seconds for exposure ramp-up (6 frames at 12fps)
  DEATH_RAMP_PEAK: 0.95,           // alpha at end of ramp (almost white)
  DEATH_SNAP_DURATION: 0.1,        // seconds to snap from peak to full white
  DEATH_WHITE_HOLD: 0.15,          // seconds to hold full white before fading
  DEATH_FADE_DURATION: 0.8,        // seconds for white to fade revealing death screen

  // FX — edge warning
  EDGE_WARN_DISTANCE: 300,         // px from boundary to start warning
  EDGE_WARN_ALPHA_MAX: 0.4,        // max overlay alpha at boundary

  // Audio
  ENGINE_BASE_FREQ: 80,            // Hz at speed 0
  ENGINE_IDLE_FREQ: 45,            // Hz for idle putter when not accelerating
  ENGINE_MAX_FREQ: 300,            // Hz at max speed
  ENGINE_VOLUME: 0.01,
  ENGINE_IDLE_VOLUME: 0.01,        // quiet putter volume when space not pressed
  IMPACT_VOLUME: 0.3,
  IMPACT_DURATION: 0.15,           // seconds
  EXPLOSION_VOLUME: 0.25,          // car-vs-crash boom volume

  // Katana slash
  KATANA_DURATION: 0.15,           // seconds the slash hitbox is active
  KATANA_COOLDOWN: 0.4,            // seconds before can slash again
  KATANA_OFFSET_X: 160,             // px right of player center where hitbox starts
  KATANA_WIDTH: 200,                // slash hitbox width
  KATANA_HEIGHT: 140,              // slash hitbox height (generous vertical)
  KATANA_COLOR: 0xccccff,          // slash visual color (silver)
  KATANA_SLASH_VOLUME: 0.15,       // whoosh sound volume
  KATANA_SPEED_WIDTH_SCALE: 3.5,   // at max speed, slash width multiplied by this (1.0 = no scaling)
  KATANA_SPEED_OFFSET_SCALE: 2.0,  // at max speed, slash offset multiplied by this (extends reach right)
  KATANA_KILL_POINTS_MIN: 10,      // points for farthest kill
  KATANA_KILL_POINTS_MAX: 100,     // points for closest kill (perfect hit)
  KATANA_KILL_POPUP_DURATION: 1.5, // seconds for popup to fade away
  KATANA_INVINCIBILITY: 0.3,       // seconds of invincibility after destroying a barrier with katana

  // Rage meter
  RAGE_FILL_MULTIPLIER: 6.9,        // scales rage gained per kill (2.0 = double fill rate, 0.5 = half)
  RAGE_MAX: 1000,                   // rage needed to activate (at 1× multiplier: 100pt kill = 10%, 10pt kill = 1%)
  RAGE_DURATION: 11,                // seconds of invincibility when rage activates
  RAGE_SPEED_MULTIPLIER: 4.0,        // player speed multiplied by this during rage mode
  RAGE_SPEED_RAMP_UP: 1.0,           // seconds to smoothly ramp up to full speed multiplier
  RAGE_SPEED_RAMP_DOWN: 6.9,         // seconds before rage ends to start ramping speed back down
  RAGE_SPAWN_RATE_MULTIPLIER: 5,   // spawn waves this many times faster during rage (10 = 10× more frequent)
  RAGE_CAR_CHANCE: 0.5,             // chance an obstacle is a car during rage (overrides normal car chance)
  RAGE_CRASH_CHANCE: 0.4,           // chance an obstacle is a crash during rage (overrides normal crash chance)
  RAGE_CAR_KILL_BONUS: 250,         // score bonus per car destroyed during rage mode
  RAGE_SPEED_BOOST_PER_KILL: 0,     // permanent road speed increase (px/sec) per obstacle destroyed with katana
  RAGE_MUSIC_VOLUME_BOOST: 1.4,      // music volume multiplied by this during rage (1.0 = no change)
  RAGE_AUDIO_DISTORTION: 0.5,       // engine audio distortion during rage (0 = clean, 1 = full fuzz)
  RAGE_END_EXPLOSION_SCALE: 5.0,     // explosion size multiplier when rage ends (covers player)
  RAGE_ZOOM_LEVEL: 1.35,              // camera zoom during rage (1.0 = no zoom, higher = more zoomed)
  RAGE_ZOOM_IN_DURATION: 0.8,          // seconds to smoothly zoom in when rage activates
  RAGE_ZOOM_OUT_DURATION: 1.5,         // seconds to smoothly zoom out when rage ends
  RAGE_EXPLOSION_SPEED_FACTOR: 0.25, // explosions scroll at this fraction of road speed during rage (0.25 = quarter speed)
  CAR_EXPLOSION_SCALE: 1.69,          // car explosions are this many times bigger than normal
  CAR_DEATH_LINGER: 4 / 60,           // seconds car remains visible after dying (4 frames at 60fps)
  // Music player UI positioning (game-unit values, scaled to canvas)
  MUSIC_UI_PAD_TOP: 40,            // game-unit padding above the music player group
  MUSIC_UI_PAD_RIGHT: 40,          // game-unit padding from right edge to music player container
  MUSIC_UI_THUMB_SCALE: 1.3,       // thumbnail scale factor (1.0 = 96px base height)
  MUSIC_UI_WIDTH: 620,             // fixed container width in game units

  // Intro track (title screen music player display)
  INTRO_TRACK_TITLE: 'Malibu - deathpixie',               // display title for the title screen track
  INTRO_TRACK_THUMBNAIL: 'assets/audio/intro_track_thumbnail.jpg',  // path to square thumbnail

  // Countdown (5→1 before gameplay starts)
  COUNTDOWN_FRAME_SIZE: 600,         // px per frame in countdown sprite sheet (square)
  COUNTDOWN_FRAMES: 5,              // usable frames (5, 4, 3, 2, 1) — 6th frame blank
  COUNTDOWN_INITIAL_DELAY: 0.5,     // seconds to wait before showing the first number (5)
  COUNTDOWN_NUMBER_DURATION: 0.8,   // seconds each number takes to scale up and fade out
  COUNTDOWN_DELAY: 0.4,             // seconds to wait before showing the next number
  COUNTDOWN_CONTROL_DELAY: 1.0,    // seconds after black fades before player can control
  COUNTDOWN_SPAWN_DELAY: 2.0,      // seconds after player gets control before obstacles spawn

  // Tutorial (pre-countdown screens)
  TUTORIAL_FADE_DURATION: 1.0,     // seconds for each fade in/out (12 frames at 12fps)
  TUTORIAL_CONTROLS_FRAMES: 29,    // number of frames in controls image sequence
  TUTORIAL_RAGE_FRAMES: 4,         // number of frames in rage image sequence

  // Parallax background
  PARALLAX_SLOWEST_FACTOR: 0.03,    // slowest scrolling layer speed as fraction of road speed
  PARALLAX_SECTION_WIDTH: 480,      // width of each repeating section (1/4 screen)

  // Lane warning indicators (preview circles on right edge)
  LANE_WARNING_DURATION: 2.0,           // seconds before obstacle appears to show warning (increase = earlier warning)
  LANE_WARNING_CAR_EXTRA: 1.0,          // extra seconds of lead time for car warnings (added to duration)
  LANE_WARNING_PREVIEW_CRASH: 0.6,      // preview scale relative to circle diameter (crash)
  LANE_WARNING_PREVIEW_CAR: 0.35,       // preview scale relative to circle diameter (car)
  LANE_WARNING_PREVIEW_SLOW: 0.4,       // preview scale relative to circle diameter (slow zone)
  LANE_WARNING_PREVIEW_PICKUP: 0.5,     // preview scale relative to circle diameter (rocket pickup)

  // Rocket launcher pickups
  PICKUP_DIAMETER: 135,              // yellow circle diameter (= laneHeight)
  PICKUP_GAP: 200,                   // px gap between obstacle right edge and pickup left edge
  PICKUP_SPAWN_CHANCE: 0.2,          // probability a CRASH obstacle spawns a pickup behind it
  PICKUP_MAX_AMMO: 3,                // max rockets player can carry
  PICKUP_HUD_CIRCLE_RADIUS: 12,     // small yellow circle radius for HUD ammo indicator
  PICKUP_HUD_X: 30,                 // X position of first ammo circle in HUD
  PICKUP_HUD_Y: 90,                 // Y position of ammo circles (below rage bar at Y=60)
  PICKUP_HUD_SPACING: 30,           // horizontal spacing between ammo circles
  PICKUP_COLOR: 0xffff00,           // yellow

  // Shield pickups
  SHIELD_MAX: 3,                      // max shields player can hold
  SHIELD_DIAMETER: 135,               // green sphere diameter (= laneHeight)
  SHIELD_COLOR: 0x00ff00,             // green
  SHIELD_SPAWN_CHANCE: 0.15,          // probability a CRASH obstacle spawns a shield behind it
  LANE_WARNING_PREVIEW_SHIELD: 0.5,   // preview scale in warning circle (shield pickup)

  // Shield HUD pills (top-center of screen)
  SHIELD_PILL_W: 60,                  // pill width in px
  SHIELD_PILL_H: 24,                  // pill height in px
  SHIELD_PILL_GAP: 10,                // gap between pills in px
  SHIELD_PILL_Y: 40,                  // Y position from top of screen
  SHIELD_PILL_BG_COLOR: 0x003300,     // dark green background
  SHIELD_PILL_BG_ALPHA: 0.5,          // background opacity
  SHIELD_PILL_ACTIVE_COLOR: 0x00ff00, // neon green active color
  SHIELD_PILL_CORNER_RADIUS: 12,      // rounded corner radius

  // Warning circle colors
  WARNING_FILL_COLOR: 0x440000,       // deep dark blood red fill
  WARNING_FILL_ALPHA: 0.69,           // 69% opacity
  WARNING_STROKE_WIDTH: 3,            // stroke width in px
  WARNING_STROKE_SLOW: 0x0066ff,      // blue for slow/puddles
  WARNING_STROKE_CRASH: 0xff8800,     // orange for obstacles/cones
  WARNING_STROKE_CAR: 0xffffff,       // white for cars
  WARNING_STROKE_ROCKET: 0xffff00,    // yellow for rocket pickups
  WARNING_STROKE_SHIELD: 0x00ff00,    // green for shield pickups

  // Rockets (projectiles)
  ROCKET_SPEED: 2400,               // px/sec rightward
  ROCKET_RADIUS: 20,                // collision circle radius
  ROCKET_DISPLAY_W: 40,             // visual width
  ROCKET_DISPLAY_H: 20,             // visual height
  ROCKET_COLOR: 0xffff00,           // yellow
  ROCKET_COOLDOWN: 0.3,             // seconds between rocket shots
  ATTACK_COOLDOWN_SLASH: .5,       // seconds after katana before any attack allowed
  ATTACK_COOLDOWN_ROCKET: 1.0,      // seconds after rocket before any attack allowed
  ROCKET_EXPLOSION_SCALE: 1.5,      // explosion size when rocket hits something
  ROCKET_KILL_POINTS: 50,           // score bonus for destroying obstacle with rocket

  RAGE_BAR_WIDTH: 1500,              // HUD bar width in px
  RAGE_BAR_HEIGHT: 16,              // HUD bar height in px
  RAGE_BAR_Y: 60,                   // Y position of rage bar (below score)
  LANE_PULSE_SPEED: 5.24,             // lane highlight pulse speed (higher = faster, default was ~15.7)
  RAGE_COLOR: 0xff4400,             // bar fill color (orange-red)
  RAGE_ACTIVE_COLOR: 0xffff00,      // bar color when rage is active (yellow)

  // Mobile touch controls
  MOBILE_CURSOR_WIDTH: 69,         // green triangle width in px
  MOBILE_CURSOR_COLOR: 0x00ff00,   // green
  MOBILE_TAP_THRESHOLD: 180,       // ms — touch shorter than this = tap (boost)
  MOBILE_ROCKET_HOLD: 1000,        // ms — hold right side this long to fire rocket
  MOBILE_SAFE_TOP: 20,             // px safe area padding when mobile

  // Custom cursor — values read from window.__cursorConfig (defined in index.html)
  CURSOR_SIZE: ((window as any).__cursorConfig?.size ?? 48) as number,
  CURSOR_TINT: ((window as any).__cursorConfig?.tint ?? 0xff0000) as number,
  CURSOR_STROKE_W: ((window as any).__cursorConfig?.strokeW ?? 0) as number,
  CURSOR_STROKE_COLOR: ((window as any).__cursorConfig?.strokeColor ?? 0xffffff) as number,
  CURSOR_DEPTH: 9998,              // render depth (on top of game, under debug)

  // Debug — set to true to enable hotkeys (0 = instant rage)
  DEBUG_KEYS: true,
} as const;
