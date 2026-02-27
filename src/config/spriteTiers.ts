/**
 * spriteTiers.ts — Static lookup for tiered spritesheet variants.
 *
 * Maps Phaser texture keys → file paths + frame dimensions per SpriteTier.
 * Generated data from: node scripts/gen-sprite-tiers.mjs
 *
 * BootScene uses getSpriteSheet() to load the correct variant per device tier.
 */

import type { SpriteTier } from '../util/device';

interface SheetTierInfo {
  file: string;   // path relative to public/ (e.g. "assets/dp_player/dp_attack_s75.png")
  fw: number;     // frame width at this tier
  fh: number;     // frame height at this tier
}

type TierMap = Record<SpriteTier, SheetTierInfo>;

/** All tiered spritesheets, keyed by Phaser texture key. */
const SHEET_TIERS: Record<string, TierMap> = {
  'player-ride': {
    s100: { file: 'assets/dp_player/dp_moto_v03.png',         fw: 702, fh: 590 },
    s75:  { file: 'assets/dp_player/dp_moto_v03_s75.png',     fw: 526, fh: 442 },
    s50:  { file: 'assets/dp_player/dp_moto_v03_mobile.png',  fw: 351, fh: 295 },
    s37:  { file: 'assets/dp_player/dp_moto_v03_s37.png',     fw: 263, fh: 221 },
    s25:  { file: 'assets/dp_player/dp_moto_v03_s25.png',     fw: 175, fh: 147 },
  },
  'player-attack': {
    s100: { file: 'assets/dp_player/dp_attack.png',         fw: 821, fh: 590 },
    s75:  { file: 'assets/dp_player/dp_attack_s75.png',     fw: 615, fh: 442 },
    s50:  { file: 'assets/dp_player/dp_attack_mobile.png',  fw: 410, fh: 295 },
    s37:  { file: 'assets/dp_player/dp_attack_s37.png',     fw: 307, fh: 221 },
    s25:  { file: 'assets/dp_player/dp_attack_s25.png',     fw: 205, fh: 147 },
  },
  'player-start': {
    s100: { file: 'assets/dp_player/dp_start.png',         fw: 824, fh: 708 },
    s75:  { file: 'assets/dp_player/dp_start_s75.png',     fw: 618, fh: 531 },
    s50:  { file: 'assets/dp_player/dp_start_mobile.png',  fw: 412, fh: 354 },
    s37:  { file: 'assets/dp_player/dp_start_s37.png',     fw: 309, fh: 265 },
    s25:  { file: 'assets/dp_player/dp_start_s25.png',     fw: 206, fh: 177 },
  },
  'player-powered': {
    s100: { file: 'assets/dp_player/dp_powered_up.png',         fw: 1076, fh: 697 },
    s75:  { file: 'assets/dp_player/dp_powered_up_s75.png',     fw: 807,  fh: 522 },
    s50:  { file: 'assets/dp_player/dp_powered_up_mobile.png',  fw: 538,  fh: 348 },
    s37:  { file: 'assets/dp_player/dp_powered_up_s37.png',     fw: 403,  fh: 261 },
    s25:  { file: 'assets/dp_player/dp_powered_up_s25.png',     fw: 269,  fh: 174 },
  },
  'player-speedup': {
    s100: { file: 'assets/dp_player/dp_speed_up.png',         fw: 655, fh: 469 },
    s75:  { file: 'assets/dp_player/dp_speed_up_s75.png',     fw: 491, fh: 351 },
    s50:  { file: 'assets/dp_player/dp_speed_up_mobile.png',  fw: 327, fh: 234 },
    s37:  { file: 'assets/dp_player/dp_speed_up_s37.png',     fw: 245, fh: 175 },
    s25:  { file: 'assets/dp_player/dp_speed_up_s25.png',     fw: 163, fh: 117 },
  },
  'player-rocket-launch': {
    s100: { file: 'assets/dp_player/dp_rocket_lancher_v2.png',         fw: 802, fh: 488 },
    s75:  { file: 'assets/dp_player/dp_rocket_lancher_v2_s75.png',     fw: 601, fh: 366 },
    s50:  { file: 'assets/dp_player/dp_rocket_lancher_v2_mobile.png',  fw: 401, fh: 244 },
    s37:  { file: 'assets/dp_player/dp_rocket_lancher_v2_s37.png',     fw: 300, fh: 183 },
    s25:  { file: 'assets/dp_player/dp_rocket_lancher_v2_s25.png',     fw: 200, fh: 122 },
  },
  'player-collect-rocket': {
    s100: { file: 'assets/COL/COL_rocket.png',         fw: 840, fh: 637 },
    s75:  { file: 'assets/COL/COL_rocket_s75.png',     fw: 630, fh: 477 },
    s50:  { file: 'assets/COL/COL_rocket_mobile.png',  fw: 420, fh: 318 },
    s37:  { file: 'assets/COL/COL_rocket_s37.png',     fw: 315, fh: 238 },
    s25:  { file: 'assets/COL/COL_rocket_s25.png',     fw: 210, fh: 159 },
  },
  'player-collect-shield': {
    s100: { file: 'assets/COL/COL_shield.png',         fw: 840, fh: 637 },
    s75:  { file: 'assets/COL/COL_shield_s75.png',     fw: 630, fh: 477 },
    s50:  { file: 'assets/COL/COL_shield_mobile.png',  fw: 420, fh: 318 },
    s37:  { file: 'assets/COL/COL_shield_s37.png',     fw: 315, fh: 238 },
    s25:  { file: 'assets/COL/COL_shield_s25.png',     fw: 210, fh: 159 },
  },
  'player-collect-hit': {
    s100: { file: 'assets/COL/COL_hit.png',         fw: 840, fh: 637 },
    s75:  { file: 'assets/COL/COL_hit_s75.png',     fw: 630, fh: 477 },
    s50:  { file: 'assets/COL/COL_hit_mobile.png',  fw: 420, fh: 318 },
    s37:  { file: 'assets/COL/COL_hit_s37.png',     fw: 315, fh: 238 },
    s25:  { file: 'assets/COL/COL_hit_s25.png',     fw: 210, fh: 159 },
  },
  'slash-vfx': {
    s100: { file: 'assets/vfx/slash.png',         fw: 140, fh: 120 },
    s75:  { file: 'assets/vfx/slash_s75.png',     fw: 105, fh: 90  },
    s50:  { file: 'assets/vfx/slash_mobile.png',  fw: 70,  fh: 60  },
    s37:  { file: 'assets/vfx/slash_s37.png',     fw: 52,  fh: 45  },
    s25:  { file: 'assets/vfx/slash_s25.png',     fw: 35,  fh: 30  },
  },
  'explosion': {
    s100: { file: 'assets/vfx/vfx_explosion.png',         fw: 440, fh: 440 },
    s75:  { file: 'assets/vfx/vfx_explosion_s75.png',     fw: 330, fh: 330 },
    s50:  { file: 'assets/vfx/vfx_explosion_mobile.png',  fw: 220, fh: 220 },
    s37:  { file: 'assets/vfx/vfx_explosion_s37.png',     fw: 165, fh: 165 },
    s25:  { file: 'assets/vfx/vfx_explosion_s25.png',     fw: 110, fh: 110 },
  },
};

/** Get the file path and frame dimensions for a spritesheet at the given tier.
 *  Falls back to s50 if the requested tier doesn't exist (shouldn't happen). */
export function getSpriteSheet(key: string, tier: SpriteTier): SheetTierInfo {
  const entry = SHEET_TIERS[key];
  if (!entry) throw new Error(`Unknown spritesheet key: ${key}`);
  return entry[tier] || entry['s50'];
}

/** Get all tiered spritesheet keys. */
export function getTieredKeys(): string[] {
  return Object.keys(SHEET_TIERS);
}
