export const TUNING = {
  // Display
  GAME_WIDTH: 1920,
  GAME_HEIGHT: 1080,
  MOBILE_SPRITE_SCALE: 0.5,         // mobile sprite sheets are pre-scaled to this factor (nearest-neighbor)

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
  // Collection animations (shared tuning — all COL sheets are identical layout)
  COL_SPEED: 2.0,                    // global playback speed multiplier for all collect animations
  COL_FRAME_WIDTH: 840,             // px per frame (3360 / 4 cols)
  COL_FRAME_HEIGHT: 637,            // px per frame (3185 / 5 rows)
  COL_ANIM_FRAMES: 19,              // usable frames (last frame of 4×5 grid is empty)
  COL_FPS: 12,                       // base animation framerate (multiplied by COL_SPEED)
  COL_SCALE: 1.269,                   // scale multiplier for all COL sprites
  COL_OFFSET_X: 0,                  // px horizontal offset for all COL anims (positive = right)
  COL_OFFSET_Y: -22,                // px vertical offset for all COL anims (negative = up)

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

  // Start animation (plays once before ride loop on game start)
  START_ANIM_FRAME_WIDTH: 824,    // px per frame (5768 / 7 cols)
  START_ANIM_FRAME_HEIGHT: 708,   // px per frame (1416 / 2 rows)
  START_ANIM_FRAMES: 14,          // total frames (7 cols × 2 rows)
  START_ANIM_FPS: 12,             // framerate for start animation
  START_ANIM_SCALE: 1.05,          // extra scale multiplier
  START_ANIM_OFFSET_X: 0,         // px horizontal offset (positive = right)
  START_ANIM_OFFSET_Y: 0,         // px vertical offset (positive = down)

  // Player dimensions and appearance
  PLAYER_DISPLAY_HEIGHT: 165,    // sprite scaled so height = this; width auto from aspect ratio
  PLAYER_COLLISION_W: 200,        // player hitbox full width (ellipse, fits motorcycle length)
  PLAYER_COLLISION_H: 6,         // player hitbox full height (ellipse, thin at tire base)
  PLAYER_COLLISION_OFFSET_Y: 80, // px to shift collision circle down (centered on tire base)
  PLAYER_TOP_Y_EXTEND: 60,  // px the player can travel above ROAD_TOP_Y
  PLAYER_BOTTOM_Y_INSET: 20, // extra px above ROAD_BOTTOM_Y to prevent clipping at bottom (accounts for scale-up)

  PLAYER_ARROW_SPEED: 600,   // px/sec vertical movement when using arrow keys
  PLAYER_MOUSE_FOLLOW_RATE: 15, // exponential approach rate for mouse Y tracking (higher = snappier, 15 ≈ 95% in 0.2s)

  // Start hold — player waits after countdown, then ramps to speed
  START_HOLD_WAIT: 0.5,        // seconds player must wait before spacebar works
  START_HOLD_RAMP: 6.9,        // seconds for road speed + player Y to ramp up after release
  START_TEXT_ON_MS: 800,       // ms the "HOLD SPACEBAR TO GO" text stays visible per blink cycle
  START_TEXT_OFF_MS: 400,      // ms the text stays hidden per blink cycle
  START_TEXT_FADE_MS: 150,     // ms fade transition between on/off (0 = hard cut)
  INTRO_TUT_SCALE: 1.01,       // multiplier to stretch the intro-to-tutorial cutscene (1.0 = exact fit)

  // Per-sprite X offsets for the "hold spacebar" starting screen (px, adjusted via debug S panel)
  SPRITE_OFFSET_PLAYER: 0,
  SPRITE_OFFSET_ROAD: 0,
  SPRITE_OFFSET_RAILING: 0,
  SPRITE_OFFSET_PARALLAX_2: 0,
  SPRITE_OFFSET_PARALLAX_3: 0,
  SPRITE_OFFSET_PARALLAX_4: 0,
  SPRITE_OFFSET_PARALLAX_5: 0,
  SPRITE_OFFSET_PARALLAX_6: 0,
  SPRITE_OFFSET_PARALLAX_7: 0,
  SPRITE_OFFSET_SKY: 0,
  SPRITE_OFFSET_HOLD_TEXT: 0,
  SPRITE_OFFSET_HUD_LABEL: 0,
  SPRITE_OFFSET_HUD_SCORE: 0,
  SPRITE_OFFSET_PROFILE_HUD: 0,

  // Player horizontal position — edit these to move the left/right death boundaries
  PLAYER_START_X: 960,       // where the bike spawns horizontally (960 = center of 1920)
  PLAYER_MIN_X: 0,           // left death boundary (0 = left screen edge)
  PLAYER_MAX_X: 1920,        // right death boundary (1920 = right screen edge)
  SPECTATOR_CURSOR_OFFSET_X: -200, // px offset from cursor X in spectator mode (negative = left)

  // Road speed — increases over time
  ROAD_BASE_SPEED: 1000,      // starting road scroll speed (px/sec)
  ROAD_SPEED_RAMP: 5,       // road speed increase per second of elapsed time (px/sec²)

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
  SLOW_BASE_WIDTH: 150,             // shortest puddle width in px (sizes are 1× through SLOW_SIZE_COUNT×)
  SLOW_SIZE_COUNT: 12,              // number of possible puddle sizes (150, 300, ... 1800)
  SLOW_COLOR: 0x0066ff,
  SLOW_PUSH_RATE: 1200,           // player speed reduced per second while overlapping

  // Puddle reflections
  REFLECTION_ALPHA: 1.0,           // opacity of reflected background layers (0-1)
  REFLECTION_OFFSET_Y: 0,         // vertical offset of reflection group (px, positive = down)
  REFLECTION_SCALE_Y: 1.0,        // vertical scale of reflection, anchored at mirror line (top of flipped group)
  REFLECTION_OBJ_PIVOT_Y: -3,      // barrier: px offset from sprite bottom edge (0 = flip at bottom, negative = higher, positive = lower)
  REFLECTION_CAR_PIVOT_Y: -33,       // car: px offset from sprite bottom edge (0 = flip at bottom, negative = higher, positive = lower)
  REFLECTION_PLAYER_PIVOT_Y: 0,    // player: px offset from sprite bottom edge
  REFLECTION_PICKUP_PIVOT_Y: 0,    // pickups (rocket + shield): px offset from sprite bottom edge
  REFLECTION_ROCKET_PIVOT_Y: 43,    // rocket projectile: px offset from sprite bottom edge
  REFLECTION_SLASH_PIVOT_Y: 0,      // slash VFX: px offset from sprite bottom edge

  // Water reflection distortion (retro sine wave + turbulence)
  REFLECTION_WAVE_AMPLITUDE: 0.01,   // UV-space horizontal displacement (~15px at 1920w)
  REFLECTION_WAVE_FREQUENCY: 200.0,  // sine wave cycles across vertical span
  REFLECTION_WAVE_FPS: 4,            // phase step rate (4 = retro chunky feel)
  REFLECTION_TURB_OCTAVES: 1,        // turbulence layers (1=clean sine, 2-4=increasingly chaotic)
  REFLECTION_TURB_LACUNARITY: 1.0,   // frequency multiplier per octave (2.0 = each layer 2x tighter)
  REFLECTION_TURB_GAIN: 0.5,         // amplitude multiplier per octave (0.5 = each layer half strength)
  REFLECTION_TURB_Y_AMOUNT: 0,      // vertical displacement as fraction of horizontal (0=none, 1=equal)

  // Water reflection color tint (monochromatic hue shift)
  REFLECTION_TINT_HUE: 220,         // target hue in degrees (220 = blue, 0 = red, 120 = green)
  REFLECTION_TINT_SATURATION: 0.7,  // saturation of the tinted color (0 = grayscale, 1 = vivid)
  REFLECTION_TINT_MIX: 0.5,         // blend: 0 = original colors, 1 = full monochromatic tint

  // Reflection RT update rate (skip-frame rendering)
  REFLECTION_RT_SKIP: 2,            // redraw object/mask RTs every Nth frame (1=every frame, 2=half, 3=third)

  // Puddle road overlay
  PUDDLE_ROAD_OPACITY: 0.4,        // road texture opacity inside puddle holes (0 = fully transparent, 1 = solid)

  CAR_COUNT: 20,                    // number of car sprite sheets (desktop)
  CAR_COUNT_MOBILE: 0,              // mobile: oncoming car count (0 = disabled, 3 cars adds ~15MB VRAM causing iOS crash)
  CAR_FRAME_WIDTH: 441,             // px per frame in sprite sheet
  CAR_FRAME_HEIGHT: 186,            // px per frame in sprite sheet
  CAR_ANIM_FRAMES: 59,              // usable frames per sheet (61 total, last 2 empty)
  CAR_SPEED_FACTOR: 0.65,           // cars travel at this fraction of road speed (scroll left slower)
  CAR_DISPLAY_SCALE: 0.80,          // visual scale multiplier for car sprites (1.0 = fill lane)
  CAR_COLLISION_W: 0.8,             // hitbox width as fraction of sprite width
  CAR_COLLISION_H: 0.667,           // hitbox height as fraction of sprite height
  CAR_COLLISION_OFFSET_X: 0,        // hitbox X offset from sprite center (px, positive = right)
  CAR_COLLISION_OFFSET_Y: 0,        // hitbox Y offset from sprite center (px, positive = down)

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

  // Score — base
  SCORE_DISTANCE_RATE: 1,         // base score per second of survival
  SCORE_SPEED_MULTIPLIER: 0.002,  // bonus multiplier per unit of player speed (faster = more points)

  // Score — cars
  SCORE_CAR_ROCKET: 420,          // points for destroying a car with a rocket
  SCORE_CAR_INVINCIBLE: 1000,     // points for running into a car while invincible (rage)
  SCORE_CAR_SHIELD: -240,         // penalty for running into a car and consuming a shield

  // Score — obstacles (barriers)
  SCORE_OBSTACLE_ROCKET: 300,     // points for blowing up an obstacle with a rocket
  SCORE_OBSTACLE_INVINCIBLE: 500, // points for running into an obstacle while invincible (rage)
  SCORE_OBSTACLE_SHIELD: -200,    // penalty for running into an obstacle and consuming a shield

  // Score — pickups
  SCORE_PICKUP_ROCKET: 1000,      // points for collecting a rocket pickup
  SCORE_PICKUP_SHIELD: 1000,      // points for collecting a shield pickup

  // Score — rage end explosion (clears screen)
  SCORE_RAGE_END_OBSTACLE: 69,    // points per obstacle destroyed by rage-end shockwave
  SCORE_RAGE_END_CAR: 420,        // points per car destroyed by rage-end shockwave

  // Score popup animation
  SCORE_POPUP_FONT_SIZE: 48,      // font size in px
  SCORE_POPUP_OFFSET_X: 0,        // horizontal offset from player center (px)
  SCORE_POPUP_OFFSET_Y: -80,      // vertical offset from player center (px, negative = above)
  SCORE_POPUP_TRAVEL_Y: -60,      // how far the popup floats upward (px, negative = up)
  SCORE_POPUP_FADE_IN: 0.1,       // seconds to fade in from 0 to full opacity
  SCORE_POPUP_HOLD: 0.6,          // seconds to hold at full opacity
  SCORE_POPUP_FADE_OUT: 0.8,      // seconds to fade out from full to 0 opacity
  SCORE_POPUP_EASE: 'Cubic.easeOut', // easing for the upward travel (Phaser ease string)

  // Player score flash
  PLAYER_FLASH_DURATION: 1.2,       // seconds — total duration of the color flash
  PLAYER_FLASH_CYCLE_MS: 80,        // ms per color step in the flash cycle

  // Score streak
  SCORE_STREAK_WINDOW: 2.0,         // seconds — streak window (can outlast slam animation)
  SCORE_STREAK_BONUS: 0.25,         // multiplier increase per streak level (+25% per streak)

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

  // FX — damage (shield absorb hit)
  SHAKE_DAMAGE_DURATION: 350,      // ms — violent shake on shield-absorb hit
  SHAKE_DAMAGE_INTENSITY: 0.025,   // shake intensity (stronger than death shake for impact feel)
  FLASH_DAMAGE_DURATION: 700,      // ms — damage PostFX fade-out duration (longer to be noticeable)
  DAMAGE_FLASH_CONTRAST: 1.4,     // contrast boost during damage (1.0 = normal)
  DAMAGE_FLASH_BRIGHTNESS: 0.05,  // brightness lift during damage
  DAMAGE_FLASH_WHITE_THRESHOLD: 0.6, // luminance above this stays white (shine-through)
  DAMAGE_FLASH_GLOW_RADIUS: 0.004,   // UV-space glow sample offset
  DAMAGE_FLASH_GLOW_STRENGTH: 0.5,   // glow bloom intensity

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
  ENGINE_VOLUME: 10,
  ENGINE_IDLE_VOLUME: 1,        // quiet putter volume when space not pressed
  ENGINE_SAMPLE_VOLUME: 2.5,       // engine sample volume at full speed
  ENGINE_SAMPLE_IDLE_VOLUME: 0.4,  // engine sample volume when idle
  ENGINE_IDLE_RATE: 0.7,           // playback rate when idle (lower pitch)
  ENGINE_MAX_RATE: 1.8,            // playback rate at max speed (higher pitch/rev)
  ENGINE_RAGE_RATE_BOOST: 0.4,     // extra playback rate added during rage mode
  ENGINE_SMOOTHING: 0.08,          // per-frame smoothing factor for rate/volume transitions
  ENGINE_REV_RATE_BOOST: 0.6,      // extra playback rate on tap (instant rev burst)
  ENGINE_REV_VOL_BOOST: 0.5,       // extra volume on tap (instant rev burst)
  ENGINE_REV_DECAY: 4.0,           // how fast the rev burst decays per second
  SFX_CLICK_VOLUME: 0.5,            // UI click volume
  SFX_HOVER_VOLUME: 0.3,            // UI hover volume
  SFX_EXPLODE_VOLUME: 0.25,         // explosion volume
  SFX_ROCKET_FIRE_VOLUME: 0.5,      // rocket launch volume
  SFX_AMMO_PICKUP_VOLUME: 1,     // ammo pickup volume
  SFX_OBSTACLE_KILL_VOLUME: 2.5,   // katana slash kill volume
  SFX_POTION_PICKUP_VOLUME: 1,   // shield/potion pickup volume
  SFX_POTION_USED_VOLUME: 2.5,     // shield/potion consumed volume
  IMPACT_VOLUME: 0.3,
  IMPACT_DURATION: 0.15,           // seconds

  // Katana slash
  KATANA_DURATION: 0.15,           // seconds the slash hitbox is active
  KATANA_COOLDOWN: 0.4,            // seconds before can slash again
  KATANA_OFFSET_X: 200,             // px right of player center where hitbox starts
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

  // Slash VFX sprite sheet (assets/vfx/slash.png — 8 frames, first is blank)
  SLASH_VFX_FRAME_WIDTH: 140,      // px per frame (1120 / 8)
  SLASH_VFX_FRAME_HEIGHT: 120,     // px per frame
  SLASH_VFX_FRAMES: 7,             // usable frames (1-7, frame 0 is blank)
  SLASH_VFX_BASE_FPS: 12,          // designed playback rate
  SLASH_VFX_SPEED: 2,            // playback speed multiplier (adjust this to tune)
  SLASH_VFX_SCALE: 3.0,            // display scale multiplier
  SLASH_VFX_OFFSET_X: 160,         // px right of player center
  SLASH_VFX_OFFSET_Y: 0,           // px below player center
  SLASH_VFX_ANGLE: 30,              // rotation in degrees (positive = clockwise)

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
  RAGE_CAR_KILL_BONUS: 250,         // (legacy — use SCORE_CAR_INVINCIBLE instead)
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
  // Music volume multipliers (1.0 = default, >1 louder, <1 quieter)
  MUSIC_VOL_MASTER: 1.0,             // master music volume multiplier (scales all music output)
  MUSIC_VOL_TITLE: 0.1,             // title screen track volume multiplier
  MUSIC_VOL_SPOTIFY: 0.1,           // Spotify playback volume multiplier
  MUSIC_VOL_YOUTUBE: 1.0,           // YouTube playback volume multiplier
  MUSIC_VOL_HUME: 1.0,               // hume (self-hosted) playback volume multiplier
  MUSIC_VOL_COUNTDOWN: 1.0,          // countdown music volume before Spotify (was 0.69, capped at 1.0)
  SFX_BIOS_MASTER: 1,             // master multiplier for BIOS intro + end beep (scales both together)
  SFX_BIOS_BOOTUP_VOLUME: .2,      // BIOS boot-up sound volume
  SFX_BIOS_BEEP_VOLUME: 0.2,        // BIOS complete chime volume
  SFX_CLICK_MASTER: 0.5,            // master multiplier for UI click sounds

  // Music player UI positioning (game-unit values, scaled to canvas)
  MUSIC_UI_PAD_TOP: 40,            // game-unit padding above the music player group
  MUSIC_UI_PAD_RIGHT: 40,          // game-unit padding from right edge (title/tutorial)
  MUSIC_UI_PAD_RIGHT_PLAY: 600,    // game-unit padding from right edge (gameplay — closer to center)
  MUSIC_UI_SCALE: 0.8,             // overall UI scale (title/tutorial)
  MUSIC_UI_SCALE_PLAY: 0.55,       // smaller scale during gameplay
  MUSIC_UI_BTN_SCALE: 1.5,         // control buttons group scale multiplier
  MUSIC_UI_SCALE_MULT: 0.9,        // manual multiplier (tune on iPhone 12 Mini first)
  MUSIC_UI_THUMB_SCALE: 1.3,       // thumbnail scale factor (1.0 = 96px base height)
  MUSIC_UI_WIDTH: 740,             // fixed container width in game units (desktop)
  MUSIC_UI_MOBILE_WIDTH: 1050,     // wider container for mobile (full-size buttons + thumbnail + gap)
  MUSIC_UI_PHONE_PAD: 40,             // px padding on each side of phone popup (screen width - 2*pad = popup width)
  MUSIC_UI_PHONE_BACKDROP_ALPHA: 0.6, // backdrop opacity behind phone popup
  MUSIC_UI_PHONE_ANIM_MS: 350,        // phone popup expand/collapse animation duration (ms)

  // Action buttons (upper-right, spritesheet buttons — 320x320 native, downscaled from 640)
  ACTION_BTN_SCALE_TOP: 0.5,         // rocket button scale (was 0.25 at 640px, now 0.5 at 320px = same 160px display)
  ACTION_BTN_PAD_RIGHT_TOP: 180,      // rocket button px from right edge of screen
  ACTION_BTN_PAD_TOP_TOP: 120,        // rocket button px from top edge of screen
  ACTION_BTN_SCALE_BOT: 1.0,         // slash button scale (was 0.5 at 640px, now 1.0 at 320px = same 320px display)
  ACTION_BTN_PAD_RIGHT_BOT: 340,      // slash button px from right edge of screen
  ACTION_BTN_PAD_TOP_BOT: 350,       // slash button px from top edge of screen
  ACTION_BTN_DEPTH: 300,             // render depth (above HUD, below modals)

  // Slider bar (vertical bar on road, left side)
  SLIDER_BAR_X: 200,                 // px from left edge (left-justified + padding)
  SLIDER_BAR_Y: 690,                 // vertical center of road ((480+1080)/2 = 780)
  SLIDER_BAR_SCALE: 1.25,             // uniform scale (1.0 = native 90x600, fits road exactly)
  SLIDER_BAR_DEPTH: 5,               // render depth (above road, below player)
  SLIDER_KNOB_Y_MIN: 480,             // knob top position (when cursor at road top)
  SLIDER_KNOB_Y_MAX: 1060,             // knob bottom position (when cursor at road bottom)

  // WMP popup window
  WMP_WIDTH_PCT: 80,                 // popup width as % of overlay
  WMP_TOP_PCT: 10,                   // popup top offset as % of overlay
  WMP_TRANSPORT_SIZE: 52,            // transport button width + height px (play/pause/skip)
  WMP_TRANSPORT_FONT: 44,           // transport button font size px
  WMP_TRANSPORT_GAP: 2,             // gap between transport buttons px

  // WMP popup video/library split
  WMP_VIDEO_MAX_W_FRAC: 0.667,      // max video width as fraction of window content width (2/3)
  WMP_SPLIT_H: 800,                 // total height of video + library content area (px)
  WMP_SPLIT_VIDEO_FRAC: 0.375,      // initial fraction of split area given to video (0-1)
  WMP_SPLIT_VIDEO_MIN: 0.375,       // minimum video fraction (300px at SPLIT_H 800)
  WMP_SPLIT_VIDEO_MAX: 0.85,        // maximum video fraction (prevents library from vanishing)
  WMP_DIVIDER_H: 6,                 // divider bar height between video and library (px)
  WMP_CELL_SCROLL_SPEED: 40,        // library cell hover-scroll speed (px/s)
  WMP_CELL_SCROLL_PAUSE: 1.0,       // pause duration at start/end of scroll (seconds)
  WMP_INFO_PAD: 40,                 // track info panel padding px
  WMP_INFO_TITLE_FONT: 18,         // track info title font size px
  WMP_INFO_ARTIST_FONT: 14,        // track info artist font size px
  WMP_INFO_BTN_FONT: 12,           // "Listen on Spotify" button font size px
  WMP_INFO_BTN_GROUP_SCALE: 0.85,   // scale of text + logo group inside the button
  WMP_INFO_GAP: 8,                 // gap between info elements px
  WMP_LIB_ROW_H: 120,              // library row height in px (constant during resize)
  WMP_MIN_W: 400,                   // minimum window width px (resize clamp)
  WMP_MIN_H: 300,                   // minimum window height px (resize clamp)
  WMP_RESIZE_HANDLE: 8,             // resize handle thickness px (edges)
  WMP_RESIZE_CORNER: 20,            // corner resize hitbox size px (larger for easy grabbing)

  // Intro track (title screen music player display)
  INTRO_TRACK_TITLE: 'RED MALIBU',                             // title track song name
  INTRO_TRACK_ARTIST: 'deathpixie',                            // title track artist name
  INTRO_TRACK_SPOTIFY_URL: 'https://open.spotify.com/track/19KIMjXBvqibE0QNq0kGjQ', // title track Spotify link
  INTRO_TRACK_THUMBNAIL: 'https://img.youtube.com/vi/n5BsRaPlglc/mqdefault.jpg',  // YouTube thumbnail

  // Countdown (5→1 before gameplay starts)
  COUNTDOWN_FRAME_SIZE: 600,         // px per frame in countdown sprite sheet (square)
  COUNTDOWN_FRAMES: 5,              // usable frames (5, 4, 3, 2, 1) — 6th frame blank
  COUNTDOWN_INITIAL_DELAY: 0.5,     // seconds to wait before showing the first number (5)
  COUNTDOWN_NUMBER_DURATION: 0.8,   // seconds each number takes to scale up and fade out
  COUNTDOWN_DELAY: 0.4,             // seconds to wait before showing the next number
  COUNTDOWN_CONTROL_DELAY: 0.5,    // seconds after black fades before player can control
  COUNTDOWN_SPAWN_DELAY: 2.0,      // seconds after player gets control before obstacles spawn

  // Tutorial (pre-countdown screens)
  TUTORIAL_FADE_DURATION: 0.35,    // seconds for each fade in/out between tutorial pages
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

  // Pickups (shared)
  PICKUP_Y_OFFSET: -50,             // px vertical offset for all pickups (negative = higher)

  // Rocket launcher pickups
  PICKUP_DIAMETER: 135,              // yellow circle diameter (= laneHeight)
  PICKUP_GAP: 200,                   // px gap between obstacle right edge and pickup left edge
  PICKUP_SPAWN_CHANCE: 0.25,         // probability a CRASH obstacle spawns a pickup behind it
  PICKUP_MAX_AMMO: 3,                // max rockets player can carry
  PICKUP_HUD_CIRCLE_RADIUS: 12,     // small yellow circle radius for HUD ammo indicator
  PICKUP_HUD_X: 30,                 // X position of first ammo circle in HUD
  PICKUP_HUD_Y: 90,                 // Y position of ammo circles (below rage bar at Y=60)
  PICKUP_HUD_SPACING: 30,           // horizontal spacing between ammo circles
  PICKUP_COLOR: 0xffff00,           // yellow
  PICKUP_FRAME_SIZE: 300,            // px per frame in pickup sprite sheet (1800 / 6)
  PICKUP_ANIM_FRAMES: 31,           // usable frames (6×6 grid = 36, last 5 blank)
  PICKUP_ANIM_FPS: 12,              // base animation framerate
  PICKUP_ANIM_SCALE: 1.0,           // scale multiplier for pickup sprite size
  PICKUP_ANIM_SPEED: 1.0,           // playback speed multiplier for pickup animation
  PICKUP_HOVER_AMOUNT: 8,             // px amplitude of vertical hover bob
  PICKUP_HOVER_SPEED: 2.0,            // hover cycles per second
  PICKUP_GLOW_SCALE: 2.0,             // glow size relative to pickup diameter
  PICKUP_GLOW_PULSE_SPEED: 1.5,       // glow pulse cycles per second
  ROCKET_ICON_SCALE: 0.2,            // scale multiplier for rocket ammo HUD icons

  // Shield pickups
  SHIELD_MAX: 3,                      // max shields player can hold
  SHIELD_DIAMETER: 135,               // pickup collision diameter (= laneHeight)
  SHIELD_COLOR: 0x00ff00,             // green (legacy, used for warnings)
  SHIELD_SPAWN_CHANCE: 0.10,          // probability a CRASH obstacle spawns a shield behind it
  LANE_WARNING_PREVIEW_SHIELD: 0.5,   // preview scale in warning circle (shield pickup)
  SHIELD_FRAME_WIDTH: 300,            // px per frame in shield sprite sheet (1800 / 6 cols)
  SHIELD_FRAME_HEIGHT: 300,           // px per frame in shield sprite sheet (900 / 3 rows)
  SHIELD_ANIM_FRAMES: 17,             // usable frames (6×3 grid = 18, last 1 blank)
  SHIELD_ANIM_FPS: 12,                // base animation framerate
  SHIELD_ANIM_SCALE: 1.0,             // scale multiplier for shield pickup sprite size
  SHIELD_ANIM_SPEED: 1.0,             // playback speed multiplier for shield pickup animation
  SHIELD_HOVER_AMOUNT: 8,             // px amplitude of vertical hover bob
  SHIELD_HOVER_SPEED: 2.0,            // hover cycles per second
  SHIELD_GLOW_SCALE: 2.0,             // glow size relative to shield diameter
  SHIELD_GLOW_PULSE_SPEED: 1.5,       // glow pulse cycles per second
  SHIELD_ICON_SCALE: 0.2,             // scale multiplier for shield HUD icons

  // Shield HUD pills (right-justified under rage bar)
  SHIELD_PILL_GAP: 10,                // gap between shield icons in px

  // Warning circle colors
  WARNING_FILL_COLOR: 0x440000,       // deep dark blood red fill
  WARNING_FILL_ALPHA: 0.69,           // 69% opacity
  WARNING_STROKE_WIDTH: 6,            // stroke width in px
  WARNING_STROKE_SLOW: 0x0066ff,      // blue for slow/puddles
  WARNING_STROKE_CRASH: 0xff8800,     // orange for obstacles/cones
  WARNING_STROKE_CAR: 0xffffff,       // white for cars
  WARNING_STROKE_ROCKET: 0xffff00,    // yellow for rocket pickups
  WARNING_STROKE_SHIELD: 0xff0000,    // red for shield pickups

  // Rockets (projectiles)
  ROCKET_SPEED: 2400,               // px/sec max rightward speed
  ROCKET_RAMP_TIME: .69,            // seconds to reach max speed (exponential ramp)
  ROCKET_RADIUS: 20,                // collision circle radius
  ROCKET_DISPLAY_W: 40,             // visual width
  ROCKET_DISPLAY_H: 20,             // visual height
  ROCKET_COLOR: 0xffff00,           // yellow
  ROCKET_PROJ_FRAME_W: 385,        // spritesheet frame width (1925 / 5)
  ROCKET_PROJ_FRAME_H: 200,        // spritesheet frame height (800 / 4)
  ROCKET_PROJ_FRAMES: 20,          // total frames (5×4)
  ROCKET_PROJ_LOOP_START: 9,       // frame index where the loop begins (skip first 9 on repeat)
  ROCKET_PROJ_FPS: 12,             // animation framerate
  ROCKET_PROJ_SCALE: .36,          // visual scale multiplier for projectile sprite
  ROCKET_PROJ_OFFSET_X: 150,        // px horizontal offset from player fire position (positive = right)
  ROCKET_PROJ_OFFSET_Y: 0,        // px vertical offset from player fire position (positive = down)
  ROCKET_GLOW_ALPHA: 0.45,          // lane glow opacity
  ROCKET_GLOW_COLOR: 0xff8800,      // lane glow tint (orange)
  ROCKET_GLOW_WIDTH_MULT: 2.0,      // glow width as multiple of lane height
  ROCKET_GLOW_STEPS: 24,            // radial gradient quality (concentric circles)
  ROCKET_GLOW_STEP_ALPHA: 0.08,     // peak alpha per concentric circle step (Gaussian-weighted)
  ROCKET_COOLDOWN: 0.3,             // seconds between rocket shots
  ATTACK_COOLDOWN_SLASH: .5,       // seconds after katana before any attack allowed
  ATTACK_COOLDOWN_ROCKET: 1.0,      // seconds after rocket before any attack allowed
  ROCKET_EXPLOSION_SCALE: 1.5,      // explosion size when rocket hits something
  ROCKET_KILL_POINTS: 50,           // (legacy — use SCORE_CAR_ROCKET / SCORE_OBSTACLE_ROCKET instead)

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

  // Mobile action buttons (placeholder — spritesheet art coming later)
  // Size = percentage of screen height (GAME_HEIGHT) so buttons look the same on all phones
  MOBILE_BTN_SCALE: 0.37,           // primary button size as fraction of screen height (0.37 × 1080 ≈ 400px)
  MOBILE_BTN_COLOR: 0x00ff00,      // green placeholder
  MOBILE_BTN_ALPHA: 0.35,          // semi-transparent overlay
  MOBILE_BTN_DEPTH: 95,            // above road/parallax, below HUD (100)
  MOBILE_BTN_FADE_IN: 500,         // ms to fade in after curtains clear
  MOBILE_BTN_PADDING: 0,           // px inset from screen edges (0 = flush with corner)

  // Profile HUD position & layout
  HUD_PAD_LEFT: 100,              // px from left screen edge to pink HUD box
  HUD_PAD_TOP: 40,                // px from top screen edge to pink HUD box
  HUD_SCALE_MULT: 1.6,            // manual scale multiplier (tune on iPhone 12 Mini first)
  HUD_REF_SCREEN_H: 375,          // iPhone 12 Mini landscape height (CSS px) — baseline for scaling
  TITLE_HUD_BASE_W: 320,          // natural HUD width at scale 1.0 (pink box width)

  // Custom cursor — values read from window.__cursorConfig (defined in index.html)
  CURSOR_SIZE: ((window as any).__cursorConfig?.size ?? 48) as number,
  CURSOR_TINT: ((window as any).__cursorConfig?.tint ?? 0xff0000) as number,
  CURSOR_STROKE_W: ((window as any).__cursorConfig?.strokeW ?? 0) as number,
  CURSOR_STROKE_COLOR: ((window as any).__cursorConfig?.strokeColor ?? 0xffffff) as number,
  CURSOR_DEPTH: 9998,              // render depth (on top of game, under debug)
  CURSOR_OFFSET_X: ((window as any).__cursorConfig?.offsetX ?? 0) as number,  // px offset to align tip (+ = right)
  CURSOR_OFFSET_Y: ((window as any).__cursorConfig?.offsetY ?? 0) as number,  // px offset to align tip (+ = down)
  CROSSHAIR_SCALE: 3.0,            // multiplier to adjust crosshair size

  // Debug — set to true to enable hotkeys (0 = instant rage)
  DEBUG_KEYS: true,

  // ── Vision Debug HUD (?hud=1 overlay) ──
  HUD_FONT_SIZE: 14,
  HUD_BG_ALPHA: 0.55,
  HUD_WIDTH: 340,
  HUD_ROW_HEIGHT: 18,
  HUD_PADDING: 6,
  HUD_X: 8,
  HUD_Y: 8,
  HUD_DEPTH: 999,
  HUD_FPS_GREEN: 30,            // FPS ≥ this = green
  HUD_FPS_YELLOW: 15,           // FPS ≥ this = yellow, below = red

  // ── Time dilation (300-style katana slow-mo) ──
  TDIL_MIN_SCALE: 0.1,            // min time scale at full slowdown (0.1 = 10% speed)
  TDIL_RAMP_DOWN_DURATION: 0.5,  // real-time seconds to ramp from 1x to min
  TDIL_HOLD_DURATION: 0.1,        // real-time seconds held at min scale
  TDIL_RAMP_UP_DURATION: 1.0,     // real-time seconds to ramp from min back to 1x
  TDIL_RAMP_DOWN_EASE: 2.0,       // power curve exponent for ramp down (higher = snappier)
  TDIL_RAMP_UP_EASE: 2.0,         // power curve exponent for ramp up
  TDIL_VERTICAL_BLEND: 0.85,      // how much vertical movement stays real-time (0=fully dilated, 1=fully real)
  TDIL_MUSIC_MIN_RATE: 0.25,      // YouTube min playback rate (YT API floor)

  // ── Sky hue rotation (album art → background color shift) ──
  SKY_HUE_TRANSITION_MS: 1500,        // smooth transition duration between hue angles
  SKY_HUE_SAMPLE_SIZE: 32,            // thumbnail downsample size for k-means color extraction
  SKY_HUE_KMEANS_ITERS: 10,           // k-means clustering iterations

  // ── Rhythm mode zones ──
  RHYTHM_KILL_ZONE_X: 200,              // right edge of kill zone (px from left)
  RHYTHM_KILL_ZONE_COLOR: 0xff0000,     // kill zone glow color
  RHYTHM_KILL_ZONE_ALPHA: 0.15,         // background fill alpha
  RHYTHM_KILL_ZONE_LINE_ALPHA: 0.6,     // right-edge line alpha
  RHYTHM_KILL_ZONE_LINE_WIDTH: 3,       // edge line width (px)
  RHYTHM_KILL_ZONE_PULSE_MIN: 0.08,     // pulse alpha min
  RHYTHM_KILL_ZONE_PULSE_MAX: 0.22,     // pulse alpha max
  RHYTHM_KILL_ZONE_PULSE_DURATION: 500, // pulse cycle ms

  RHYTHM_SWEET_SPOT_X: 960,             // center line X (GAME_WIDTH / 2)
  RHYTHM_SWEET_SPOT_COLOR: 0xffffff,    // line color
  RHYTHM_SWEET_SPOT_ALPHA: 0.25,        // line alpha
  RHYTHM_SWEET_SPOT_LINE_WIDTH: 2,      // line width (px)
  RHYTHM_SWEET_SPOT_DASH: 20,           // dash length px
  RHYTHM_SWEET_SPOT_GAP: 15,            // gap length px

  RHYTHM_BONUS_ZONE_WIDTH: 100,         // 2X window width centered on sweet spot
  RHYTHM_BONUS_ZONE_COLOR: 0x00ff00,    // green tint
  RHYTHM_BONUS_ZONE_ALPHA: 0.08,        // subtle background tint
  RHYTHM_BONUS_AMMO_MULT: 2,            // ammo multiplier in bonus zone
  RHYTHM_BONUS_SCORE_MULT: 2,           // score multiplier in bonus zone
  RHYTHM_BONUS_POPUP_SIZE: 72,          // "2X" font size
  RHYTHM_BONUS_POPUP_COLOR: '#00FF00',  // bright green
  RHYTHM_BONUS_POPUP_DURATION: 1400,    // total popup lifespan ms
  RHYTHM_BONUS_FLASH_COLOR: 0x00ff00,   // screen flash color
  RHYTHM_BONUS_FLASH_ALPHA: 0.3,        // screen flash intensity
  RHYTHM_BONUS_FLASH_DURATION: 200,     // screen flash duration ms

  // ── Rhythm mode guardians ──
  RHYTHM_GUARDIAN_TINT: 0xff88ff,       // purple/magenta tint for guardian obstacles
  RHYTHM_GUARDIAN_BASE_SCORE: 100,      // score when slashed outside bonus zone
  RHYTHM_GUARDIAN_MAX_SCORE: 500,       // max score when slashed at dead center
  RHYTHM_GUARDIAN_ZONE_HALF: 150,       // half-width of proximity scoring zone (px from center)

  // ── Enemy cars (rhythm mode) ──
  RHYTHM_ENEMY_CAR_GLOW_COLOR: 0xff0000,   // red glow color
  RHYTHM_ENEMY_CAR_GLOW_OUTER: 8,          // glow outer strength
  RHYTHM_ENEMY_CAR_GLOW_INNER: 0,          // glow inner strength
  RHYTHM_ENEMY_CAR_GLOW_KNOCKOUT: true,    // knockout mode (stroke only, not fill)
  RHYTHM_ENEMY_CAR_BASE_SCORE: 200,        // score when killed outside timing window
  RHYTHM_ENEMY_CAR_MAX_SCORE: 1000,        // max score at dead center
  RHYTHM_ENEMY_CAR_ZONE_HALF: 150,         // half-width of proximity scoring zone (px from center)

} as const;
