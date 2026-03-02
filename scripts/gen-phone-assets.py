#!/usr/bin/env python3
"""
gen-phone-assets.py — Unified Pixel Density (PPP) Asset Pipeline

Generates resolution-optimized phone assets for DP Moto.
One PPP_TARGET multiplier controls the source resolution of every asset.
Default mode: ONE optimized resolution per asset (worst-case lane).
Legacy --per-lane mode: 4 per-lane variants.

Usage:
    python scripts/gen-phone-assets.py --ppp 1.3 --render-scale 0.75
    python scripts/gen-phone-assets.py --ppp 1.0  # softer, less VRAM
    python scripts/gen-phone-assets.py --ppp 1.5  # crisper, more VRAM
    python scripts/gen-phone-assets.py --per-lane  # legacy: 4 files per asset
    python scripts/gen-phone-assets.py --car-count 20  # all 20 car designs

Reads tuning values from src/config/tuning.ts automatically.
Outputs to public/assets/phone/ and generates src/config/phoneManifest.ts.
"""

import argparse
import json
import math
import os
import re
import sys
from pathlib import Path
from PIL import Image

# ── Project paths ────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
PUBLIC_DIR = PROJECT_ROOT / "public"
ASSETS_DIR = PUBLIC_DIR / "assets"
PHONE_DIR = ASSETS_DIR / "phone"
TUNING_FILE = PROJECT_ROOT / "src" / "config" / "tuning.ts"
MANIFEST_FILE = PROJECT_ROOT / "src" / "config" / "phoneManifest.ts"

# ── Parse tuning.ts ──────────────────────────────────────────────
def parse_tuning(path: Path) -> dict:
    """Extract numeric constants from tuning.ts."""
    text = path.read_text(encoding="utf-8")
    consts = {}
    # Match patterns like: KEY: 1.08,  or KEY: 165,  or KEY: [1.0, 1.03, 1.1, 1.4],
    for m in re.finditer(r"(\w+)\s*:\s*(-?[\d.]+)\s*,", text):
        key, val = m.group(1), m.group(2)
        consts[key] = float(val) if "." in val else int(val)
    # Match array patterns like: LANE_SCALES: [1.0, 1.03, 1.1, 1.4],
    for m in re.finditer(r"(\w+)\s*:\s*\[([\d.,\s]+)\]", text):
        key = m.group(1)
        vals = [float(v.strip()) for v in m.group(2).split(",") if v.strip()]
        consts[key] = vals
    return consts


# ── Lane geometry ────────────────────────────────────────────────
def compute_lane_centers(road_top, road_bottom, lane_count):
    """Compute Y center of each lane."""
    lane_h = (road_bottom - road_top) / lane_count
    return [road_top + lane_h * i + lane_h / 2 for i in range(lane_count)]


def player_persp_scale(y, road_top, road_bottom, scale_top, scale_bottom):
    """Player perspective scale at Y position."""
    t = (y - road_top) / (road_bottom - road_top)
    return scale_top + t * (scale_bottom - scale_top)


# ── Resize helpers ───────────────────────────────────────────────
def resize_spritesheet(img: Image.Image, src_fw, src_fh, target_fw, target_fh):
    """Resize a spritesheet by resizing proportionally (maintains grid layout).

    Computes the scale factor from frame dimensions and applies to entire sheet.
    Returns (resized_image, actual_fw, actual_fh).
    """
    scale_x = target_fw / src_fw
    scale_y = target_fh / src_fh
    # Use uniform scale (take the larger to ensure we don't go below target)
    # Actually, use per-axis scale since aspect ratio is maintained per-frame
    new_w = max(1, round(img.width * scale_x))
    new_h = max(1, round(img.height * scale_y))
    resized = img.resize((new_w, new_h), Image.NEAREST)
    actual_fw = max(1, round(src_fw * scale_x))
    actual_fh = max(1, round(src_fh * scale_y))
    return resized, actual_fw, actual_fh


def resize_image(img: Image.Image, target_w, target_h):
    """Resize a single image to target dimensions."""
    tw = max(1, round(target_w))
    th = max(1, round(target_h))
    return img.resize((tw, th), Image.NEAREST)


# ── Asset definitions ────────────────────────────────────────────
class AssetSpec:
    """Specification for a single asset to be resized."""
    def __init__(self, key, src_path, frame_w, frame_h, display_w, display_h,
                 is_lane_based=False, scale_fn=None, frame_count=0):
        self.key = key
        self.src_path = src_path
        self.frame_w = frame_w
        self.frame_h = frame_h
        self.display_w = display_w  # logical display width at scale 1.0
        self.display_h = display_h  # logical display height at scale 1.0
        self.is_lane_based = is_lane_based
        self.scale_fn = scale_fn    # function(lane_idx) -> scale multiplier
        self.frame_count = frame_count


def build_asset_specs(T: dict) -> list:
    """Build the complete asset inventory from tuning constants."""
    specs = []

    # Helper: display size for player animations
    pdh = T["PLAYER_DISPLAY_HEIGHT"]  # 165

    def player_display(fw, fh, scale=1.0):
        dh = pdh * scale
        dw = dh * (fw / fh)
        return dw, dh

    # Lane scales
    road_top = T["ROAD_TOP_Y"]
    road_bottom = T["ROAD_BOTTOM_Y"]
    lane_count = T["LANE_COUNT"]
    lane_scales = T["LANE_SCALES"]
    scale_top = T["PLAYER_SCALE_TOP"]
    scale_bottom = T["PLAYER_SCALE_BOTTOM"]
    lane_centers = compute_lane_centers(road_top, road_bottom, lane_count)

    # Player perspective scales at lane centers
    player_lane_scales = [player_persp_scale(y, road_top, road_bottom, scale_top, scale_bottom)
                          for y in lane_centers]

    # ── A. PLAYER SPRITES (9 animations × 4 lanes) ──────────────
    player_anims = [
        ("player-ride", "dp_player/dp_moto_v03.png",
         T["PLAYER_FRAME_WIDTH"], T["PLAYER_FRAME_HEIGHT"], 1.0, T["PLAYER_ANIM_FRAMES"]),
        ("player-attack", "dp_player/dp_attack.png",
         T["PLAYER_ATTACK_FRAME_WIDTH"], T["PLAYER_ATTACK_FRAME_HEIGHT"], 1.0, T["PLAYER_ATTACK_ANIM_FRAMES"]),
        ("player-start", "dp_player/dp_start.png",
         T["START_ANIM_FRAME_WIDTH"], T["START_ANIM_FRAME_HEIGHT"], T["START_ANIM_SCALE"], T["START_ANIM_FRAMES"]),
        ("player-powered", "dp_player/dp_powered_up.png",
         T["POWERED_FRAME_WIDTH"], T["POWERED_FRAME_HEIGHT"], T["POWERED_SCALE"], T["POWERED_ANIM_FRAMES"]),
        ("player-speedup", "dp_player/dp_speed_up.png",
         T["SPEEDUP_FRAME_WIDTH"], T["SPEEDUP_FRAME_HEIGHT"], T["SPEEDUP_SCALE"],
         T["SPEEDUP_OUTRO_END"] + 1),  # 64 total frames
        ("player-rocket-launch", "dp_player/dp_rocket_lancher_v2.png",
         T["ROCKET_LAUNCHER_FRAME_WIDTH"], T["ROCKET_LAUNCHER_FRAME_HEIGHT"],
         T["ROCKET_LAUNCHER_SCALE"], T["ROCKET_LAUNCHER_ANIM_FRAMES"]),
        ("player-collect-rocket", "COL/COL_rocket.png",
         T["COL_FRAME_WIDTH"], T["COL_FRAME_HEIGHT"], T["COL_SCALE"], T["COL_ANIM_FRAMES"]),
        ("player-collect-shield", "COL/COL_shield.png",
         T["COL_FRAME_WIDTH"], T["COL_FRAME_HEIGHT"], T["COL_SCALE"], T["COL_ANIM_FRAMES"]),
        ("player-collect-hit", "COL/COL_hit.png",
         T["COL_FRAME_WIDTH"], T["COL_FRAME_HEIGHT"], T["COL_SCALE"], T["COL_ANIM_FRAMES"]),
    ]

    for key, src_rel, fw, fh, anim_scale, frame_count in player_anims:
        dw, dh = player_display(fw, fh, anim_scale)
        specs.append(AssetSpec(
            key=key,
            src_path=str(ASSETS_DIR / src_rel),
            frame_w=fw, frame_h=fh,
            display_w=dw, display_h=dh,
            is_lane_based=True,
            scale_fn=lambda li, pls=player_lane_scales: pls[li],
            frame_count=frame_count,
        ))

    # ── B. CARS (4 lane variants × N car designs) ────────────────
    car_fw = T["CAR_FRAME_WIDTH"]    # 441
    car_fh = T["CAR_FRAME_HEIGHT"]   # 186
    lane_h = (road_bottom - road_top) / lane_count  # 150
    car_display_h = lane_h / T["CAR_COLLISION_H"]    # 150 / 0.667 = 225
    car_display_w = car_display_h * (car_fw / car_fh)  # 225 * (441/186) = 533
    car_display_w *= T["CAR_DISPLAY_SCALE"]  # × 0.80 = 427
    car_display_h *= T["CAR_DISPLAY_SCALE"]  # × 0.80 = 180

    # Find all car master files (full-res, not mobile/tiny)
    car_files = sorted(ASSETS_DIR.glob("cars/car_*.png"))
    car_masters = [f for f in car_files if "_mobile" not in f.name and "tiny" not in str(f)]

    for car_path in car_masters:
        car_num = re.search(r"car_(\d+)", car_path.name)
        if not car_num:
            continue
        key = f"car-{car_num.group(1)}"
        specs.append(AssetSpec(
            key=key,
            src_path=str(car_path),
            frame_w=car_fw, frame_h=car_fh,
            display_w=car_display_w, display_h=car_display_h,
            is_lane_based=True,
            scale_fn=lambda li, ls=lane_scales: ls[li],
            frame_count=T["CAR_ANIM_FRAMES"],
        ))

    # ── C. CRASH BARRIERS (4 lane variants) ──────────────────────
    barrier_src = ASSETS_DIR / "obstacles" / "road_barrier_01.png"
    if barrier_src.exists():
        # Barrier display: laneH × OBSTACLE_DISPLAY_SCALE height, width from aspect
        barrier_img = Image.open(barrier_src)
        b_src_w, b_src_h = barrier_img.size
        barrier_img.close()
        b_display_h = lane_h * T["OBSTACLE_DISPLAY_SCALE"]  # 150 × 0.85 = 127.5
        b_display_w = b_display_h * (b_src_w / b_src_h)      # portrait -> narrow
        specs.append(AssetSpec(
            key="barrier",
            src_path=str(barrier_src),
            frame_w=b_src_w, frame_h=b_src_h,
            display_w=b_display_w, display_h=b_display_h,
            is_lane_based=True,
            scale_fn=lambda li, ls=lane_scales: ls[li],
            frame_count=1,
        ))

    # Barrier reflection variant
    barrier_ref = ASSETS_DIR / "obstacles" / "road_barrier_01_reflection_alt.png"
    if barrier_ref.exists():
        br_img = Image.open(barrier_ref)
        br_w, br_h = br_img.size
        br_img.close()
        specs.append(AssetSpec(
            key="barrier-reflection",
            src_path=str(barrier_ref),
            frame_w=br_w, frame_h=br_h,
            display_w=b_display_w, display_h=b_display_h,
            is_lane_based=True,
            scale_fn=lambda li, ls=lane_scales: ls[li],
            frame_count=1,
        ))

    # ── D. PICKUPS (4 lane variants each) ────────────────────────
    pickup_diam = T["PICKUP_DIAMETER"]  # 135
    pickup_fw = T["PICKUP_FRAME_SIZE"]  # 300

    for pkey, pfile, p_fh, p_frames in [
        ("pickup-rocket", "pickups/rocket pickup.png", pickup_fw, T["PICKUP_ANIM_FRAMES"]),
        ("pickup-shield", "pickups/shield_pickup.png", T["SHIELD_FRAME_HEIGHT"], T["SHIELD_ANIM_FRAMES"]),
    ]:
        src = ASSETS_DIR / pfile
        if src.exists():
            specs.append(AssetSpec(
                key=pkey,
                src_path=str(src),
                frame_w=pickup_fw, frame_h=p_fh,
                display_w=pickup_diam, display_h=pickup_diam,
                is_lane_based=True,
                scale_fn=lambda li, pls=player_lane_scales: pls[li],
                frame_count=p_frames,
            ))

    # ── E. ROCKET PROJECTILE (4 lane variants) ───────────────────
    rp_fw = T["ROCKET_PROJ_FRAME_W"]   # 385
    rp_fh = T["ROCKET_PROJ_FRAME_H"]   # 200
    rp_scale = T["ROCKET_PROJ_SCALE"]   # 0.36
    rp_display_w = rp_fw * rp_scale     # 139
    rp_display_h = rp_fh * rp_scale     # 72
    rp_src = ASSETS_DIR / "pickups" / "rocket_Projectile.png"
    if rp_src.exists():
        specs.append(AssetSpec(
            key="rocket-proj",
            src_path=str(rp_src),
            frame_w=rp_fw, frame_h=rp_fh,
            display_w=rp_display_w, display_h=rp_display_h,
            is_lane_based=True,
            scale_fn=lambda li, pls=player_lane_scales: pls[li],
            frame_count=T["ROCKET_PROJ_FRAMES"],
        ))

    # ── F. VFX (1 variant each, source-limited) ─────────────────
    # Slash — intentionally oversized for bloom, keep full-res
    slash_src = ASSETS_DIR / "vfx" / "slash.png"
    if slash_src.exists():
        specs.append(AssetSpec(
            key="slash-vfx",
            src_path=str(slash_src),
            frame_w=T["SLASH_VFX_FRAME_WIDTH"], frame_h=T["SLASH_VFX_FRAME_HEIGHT"],
            display_w=T["SLASH_VFX_FRAME_WIDTH"] * T["SLASH_VFX_SCALE"],
            display_h=T["SLASH_VFX_FRAME_HEIGHT"] * T["SLASH_VFX_SCALE"],
            is_lane_based=False,
            frame_count=T["SLASH_VFX_FRAMES"] + 1,  # +1 for blank frame 0
        ))

    # Explosion
    exp_src = ASSETS_DIR / "vfx" / "vfx_explosion.png"
    if exp_src.exists():
        exp_size = T["EXPLOSION_FRAME_SIZE"]  # 440
        exp_display = exp_size * T["CAR_EXPLOSION_SCALE"]  # 440 × 1.69 = 744
        specs.append(AssetSpec(
            key="explosion",
            src_path=str(exp_src),
            frame_w=exp_size, frame_h=exp_size,
            display_w=exp_display, display_h=exp_display,
            is_lane_based=False,
            frame_count=T["EXPLOSION_ANIM_FRAMES"],
        ))

    return specs


# ── Background / road / UI specs (non-lane, canvas-sized) ───────
def build_bg_specs(T: dict, render_scale: float):
    """Build background/road/UI asset specs (single variant, canvas-sized)."""
    canvas_w = T["GAME_WIDTH"] * render_scale   # 1440
    canvas_h = T["GAME_HEIGHT"] * render_scale   # 810

    bg_specs = []  # list of (key, src_path, target_w, target_h, format)

    # Sky (static fill, full canvas width)
    sky_src = ASSETS_DIR / "background" / "sky.jpg"
    if sky_src.exists():
        img = Image.open(sky_src)
        sw, sh = img.size
        img.close()
        # Scale width to canvas, maintain aspect ratio
        scale = canvas_w / sw
        bg_specs.append(("sky", str(sky_src), int(canvas_w), round(sh * scale), "JPEG"))

    # Buildings (two layers)
    for bname, bfile in [
        ("buildings-back", "background/buildings_back_row_dark.png"),
        ("buildings-front", "background/buildings_Front_row_dark.png"),
    ]:
        src = ASSETS_DIR / bfile
        if src.exists():
            img = Image.open(src)
            bw, bh = img.size
            img.close()
            scale = canvas_w / bw
            bg_specs.append((bname, str(src), int(canvas_w), max(1, round(bh * scale)), "PNG"))

    # Road tile (spritesheet: 2048×534 per frame, 6 frames)
    road_src = ASSETS_DIR / "background" / "road_tile.jpg"
    if road_src.exists():
        img = Image.open(road_src)
        rw, rh = img.size
        img.close()
        road_frame_h = 534  # from earlier analysis
        scale = canvas_w / rw
        bg_specs.append(("road-tile", str(road_src), round(rw * scale), round(rh * scale), "JPEG"))

    # Road lines (same dimensions as road tile)
    road_lines_src = ASSETS_DIR / "background" / "road_lines_tile.png"
    if road_lines_src.exists():
        img = Image.open(road_lines_src)
        rlw, rlh = img.size
        img.close()
        scale = canvas_w / rlw
        bg_specs.append(("road-lines", str(road_lines_src), round(rlw * scale), round(rlh * scale), "PNG"))

    # Railing tile (2048×100 per frame, 9 frames)
    railing_src = ASSETS_DIR / "background" / "railing_tile.jpg"
    if railing_src.exists():
        img = Image.open(railing_src)
        raw, rah = img.size
        img.close()
        scale = canvas_w / raw
        bg_specs.append(("railing", str(railing_src), round(raw * scale), round(rah * scale), "JPEG"))

    # Puddle (composite from color + alpha)
    puddle_color = ASSETS_DIR / "background" / "puddle_color.jpg"
    puddle_alpha = ASSETS_DIR / "background" / "puddle_alpha.jpg"
    if puddle_color.exists() and puddle_alpha.exists():
        img = Image.open(puddle_color)
        pw, ph = img.size
        img.close()
        # Typical puddle display ~600px wide -> canvas 450px. PPP = 732/450 = 1.63
        # Scale down slightly for PPP target
        bg_specs.append(("puddle", "COMPOSITE", pw, ph, "PNG"))

    return bg_specs


# ── Main pipeline ────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Generate PPP-optimized phone assets")
    parser.add_argument("--ppp", type=float, default=1.3, help="PPP target (default: 1.3)")
    parser.add_argument("--render-scale", type=float, default=0.75, help="Render scale (default: 0.75)")
    parser.add_argument("--dry-run", action="store_true", help="Print sizing without generating files")
    parser.add_argument("--car-count", type=int, default=20, help="Number of car designs to generate (default: 20)")
    parser.add_argument("--per-lane", action="store_true", help="Generate 4 per-lane variants (default: single optimized resolution)")
    args = parser.parse_args()

    ppp = args.ppp
    rs = args.render_scale
    dry_run = args.dry_run
    car_limit = args.car_count
    single_mode = not args.per_lane

    mode_label = "SINGLE" if single_mode else "PER-LANE"
    print(f"\n{'='*60}")
    print(f"  PHONE ASSET PIPELINE — PPP {ppp}, renderScale {rs}, {mode_label}")
    print(f"{'='*60}\n")

    # Parse tuning
    T = parse_tuning(TUNING_FILE)
    print(f"  Parsed {len(T)} constants from tuning.ts")

    # Build specs
    specs = build_asset_specs(T)
    bg_specs = build_bg_specs(T, rs)

    # Create output dir
    if not dry_run:
        PHONE_DIR.mkdir(parents=True, exist_ok=True)

    # ── Process lane-based assets ────────────────────────────────
    manifest = {}
    total_vram = 0
    source_limited = []

    lane_count = T["LANE_COUNT"]

    for spec in specs:
        # Limit cars to car_count
        if spec.key.startswith("car-"):
            car_num = int(spec.key.split("-")[1])
            if car_num > car_limit:
                continue

        if spec.is_lane_based and not single_mode:
            # ── PER-LANE MODE: 4 files per asset ──────────────────
            lanes_data = []
            src_img = Image.open(spec.src_path)

            for li in range(lane_count):
                lane_scale = spec.scale_fn(li)
                ideal_w = spec.display_w * lane_scale * rs * ppp
                ideal_h = spec.display_h * lane_scale * rs * ppp
                target_fw = min(round(ideal_w), spec.frame_w)
                target_fh = min(round(ideal_h), spec.frame_h)

                if round(ideal_w) > spec.frame_w or round(ideal_h) > spec.frame_h:
                    source_limited.append(f"{spec.key} L{li}")

                target_fw = max(1, target_fw)
                target_fh = max(1, target_fh)

                out_name = f"{spec.key}-L{li}.png"
                out_path = PHONE_DIR / out_name

                if not dry_run:
                    resized, actual_fw, actual_fh = resize_spritesheet(
                        src_img, spec.frame_w, spec.frame_h, target_fw, target_fh
                    )
                    resized.save(str(out_path), "PNG", optimize=True)
                    target_fw = actual_fw
                    target_fh = actual_fh

                frame_count = spec.frame_count or 1
                vram = frame_count * target_fw * target_fh * 4
                total_vram += vram

                canvas_w = round(spec.display_w * lane_scale * rs)
                canvas_h = round(spec.display_h * lane_scale * rs)
                achieved_ppp = target_fw / canvas_w if canvas_w > 0 else 0

                lanes_data.append({
                    "file": f"assets/phone/{out_name}",
                    "fw": target_fw,
                    "fh": target_fh,
                    "canvas": f"{canvas_w}x{canvas_h}",
                    "ppp": round(achieved_ppp, 2),
                })

            src_img.close()
            manifest[spec.key] = {"lanes": lanes_data}

            print(f"\n  {spec.key} ({spec.frame_count} frames)")
            for li, ld in enumerate(lanes_data):
                print(f"    L{li}: {ld['fw']}x{ld['fh']} -> canvas {ld['canvas']} (PPP {ld['ppp']})")

        else:
            # ── SINGLE MODE (default) or non-lane asset ───────────
            # Use worst-case (max) lane scale for lane-based assets
            if spec.is_lane_based:
                max_scale = max(spec.scale_fn(li) for li in range(lane_count))
            else:
                max_scale = 1.0

            ideal_w = spec.display_w * max_scale * rs * ppp
            ideal_h = spec.display_h * max_scale * rs * ppp
            target_fw = min(round(ideal_w), spec.frame_w)
            target_fh = min(round(ideal_h), spec.frame_h)
            target_fw = max(1, target_fw)
            target_fh = max(1, target_fh)

            if round(ideal_w) > spec.frame_w or round(ideal_h) > spec.frame_h:
                source_limited.append(spec.key)

            out_name = f"{spec.key}-phone.png"
            out_path = PHONE_DIR / out_name

            if not dry_run:
                src_img = Image.open(spec.src_path)
                resized, target_fw, target_fh = resize_spritesheet(
                    src_img, spec.frame_w, spec.frame_h, target_fw, target_fh
                )
                resized.save(str(out_path), "PNG", optimize=True)
                src_img.close()

            frame_count = spec.frame_count or 1
            vram = frame_count * target_fw * target_fh * 4
            total_vram += vram

            canvas_w = round(spec.display_w * max_scale * rs)
            canvas_h = round(spec.display_h * max_scale * rs)
            achieved_ppp = target_fw / canvas_w if canvas_w > 0 else 0

            manifest[spec.key] = {
                "file": f"assets/phone/{out_name}",
                "fw": target_fw,
                "fh": target_fh,
            }

            src_label = "SRC-LTD" if spec.key in source_limited else ""
            print(f"\n  {spec.key} ({spec.frame_count} frames)")
            print(f"    src: {spec.frame_w}x{spec.frame_h}  ->  opt: {target_fw}x{target_fh}  ->  display: {canvas_w}x{canvas_h}  (PPP {round(achieved_ppp, 2)}) {src_label}")

    # ── Process backgrounds ──────────────────────────────────────
    print(f"\n  --- Backgrounds & Road ---")

    for key, src_path, target_w, target_h, fmt in bg_specs:
        target_w = max(1, target_w)
        target_h = max(1, target_h)

        ext = ".jpg" if fmt == "JPEG" else ".png"
        out_name = f"{key}-phone{ext}"
        out_path = PHONE_DIR / out_name

        if key == "puddle" and src_path == "COMPOSITE":
            # Composite puddle from color + alpha
            puddle_color = ASSETS_DIR / "background" / "puddle_color.jpg"
            puddle_alpha = ASSETS_DIR / "background" / "puddle_alpha.jpg"

            if not dry_run:
                color_img = Image.open(puddle_color).convert("RGB")
                alpha_img = Image.open(puddle_alpha).convert("L")

                # Scale for PPP target
                scale = rs * ppp
                tw = max(1, round(color_img.width * scale))
                th = max(1, round(color_img.height * scale))

                color_resized = color_img.resize((tw, th), Image.NEAREST)
                alpha_resized = alpha_img.resize((tw, th), Image.NEAREST)

                # Composite RGBA
                rgba = color_resized.convert("RGBA")
                rgba.putalpha(alpha_resized)
                rgba.save(str(out_path), "PNG", optimize=True)

                target_w, target_h = tw, th
                color_img.close()
                alpha_img.close()

            vram = target_w * target_h * 4
        else:
            if not dry_run and Path(src_path).exists():
                src_img = Image.open(src_path)
                if fmt == "JPEG":
                    resized = resize_image(src_img.convert("RGB"), target_w, target_h)
                    resized.save(str(out_path), "JPEG", quality=90)
                else:
                    resized = resize_image(src_img, target_w, target_h)
                    resized.save(str(out_path), "PNG", optimize=True)
                src_img.close()

            channels = 3 if fmt == "JPEG" else 4
            vram = target_w * target_h * channels

        total_vram += vram

        manifest[key] = {
            "file": f"assets/phone/{out_name}",
            "w": target_w,
            "h": target_h,
        }

        print(f"  {key}: {target_w}x{target_h} ({fmt})")

    # ── Generate TypeScript manifest ─────────────────────────────
    if not dry_run:
        write_manifest(manifest)
        print(f"\n  Generated: {MANIFEST_FILE}")

    # ── VRAM Report ──────────────────────────────────────────────
    vram_mb = total_vram / (1024 * 1024)

    print(f"\n{'='*60}")
    print(f"  VRAM SUMMARY")
    print(f"{'='*60}")
    print(f"  Total estimated VRAM: {vram_mb:.1f} MB")
    if source_limited:
        print(f"  Source-limited: {', '.join(source_limited[:10])}")
        if len(source_limited) > 10:
            print(f"    ... and {len(source_limited) - 10} more")

    asset_count = sum(
        len(v.get("lanes", [])) if "lanes" in v else 1
        for v in manifest.values()
    )
    print(f"  Total assets generated: {asset_count}")
    print(f"  Output directory: {PHONE_DIR}")
    print(f"{'='*60}\n")

    if dry_run:
        print("  [DRY RUN — no files written]\n")


# ── Manifest writer ──────────────────────────────────────────────
def write_manifest(manifest: dict):
    """Generate src/config/phoneManifest.ts from manifest dict."""
    lines = [
        "// src/config/phoneManifest.ts — AUTO-GENERATED by gen-phone-assets.py",
        "// DO NOT EDIT MANUALLY. Re-run: python scripts/gen-phone-assets.py",
        "",
        "export interface PhoneAssetEntry {",
        "  file: string;",
        "  fw?: number;  // frame width (spritesheets)",
        "  fh?: number;  // frame height (spritesheets)",
        "  w?: number;   // image width (backgrounds)",
        "  h?: number;   // image height (backgrounds)",
        "  lanes?: { file: string; fw: number; fh: number }[];  // per-lane mode only",
        "}",
        "",
        "export const PHONE_MANIFEST: Record<string, PhoneAssetEntry> = {",
    ]

    for key, data in manifest.items():
        if "lanes" in data:
            lines.append(f"  '{key}': {{")
            lines.append(f"    lanes: [")
            for ld in data["lanes"]:
                lines.append(f"      {{ file: '{ld['file']}', fw: {ld['fw']}, fh: {ld['fh']} }},")
            lines.append(f"    ],")
            lines.append(f"  }},")
        elif "fw" in data:
            lines.append(f"  '{key}': {{ file: '{data['file']}', fw: {data['fw']}, fh: {data['fh']} }},")
        else:
            lines.append(f"  '{key}': {{ file: '{data['file']}', w: {data['w']}, h: {data['h']} }},")

    lines.append("};")
    lines.append("")

    MANIFEST_FILE.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
