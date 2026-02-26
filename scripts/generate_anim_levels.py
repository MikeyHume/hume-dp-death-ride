"""
Generate multi-resolution title animation frames for A/B testing.

Creates 49 resolution levels (L01-L49) from original 1920x1080 frames
using nearest-neighbor downscaling. Originals stay untouched as L00.

Linear 2% steps: scale(level) = 1.0 - level * 0.02
  L00 = 1920x1080 (original)
  L25 = 960x540
  L49 = 38x22

Usage:
  python scripts/generate_anim_levels.py
  python scripts/generate_anim_levels.py --quality 80
  python scripts/generate_anim_levels.py --single-level 25
  python scripts/generate_anim_levels.py --dry-run
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("ERROR: Pillow not installed. Run: pip install Pillow")
    sys.exit(1)


BASE_DIR = Path(__file__).resolve().parent.parent / "public" / "assets" / "start"

ANIMATIONS = [
    {
        "name": "start_loop",
        "prefix": "DP_Death_Ride_Title_Loop",
        "count": 27,
    },
    {
        "name": "start_play",
        "prefix": "DP_Death_Ride_Title_Start",
        "count": 25,
    },
]

TOTAL_LEVELS = 49  # L01 through L49 (L00 = originals)


def calc_dimensions(level: int, orig_w: int = 1920, orig_h: int = 1080) -> tuple[int, int]:
    """Calculate target dimensions for a given level (linear 2% steps, even, min 2)."""
    scale = 1.0 - level * 0.02
    w = max(2, round(orig_w * scale))
    h = max(2, round(orig_h * scale))
    # Force even dimensions for GPU compatibility
    if w % 2 != 0:
        w += 1
    if h % 2 != 0:
        h += 1
    return w, h


def process_animation(anim: dict, levels: list[int], quality: int, dry_run: bool) -> list[dict]:
    """Process one animation set (e.g., start_loop) across all requested levels."""
    src_dir = BASE_DIR / anim["name"]
    if not src_dir.exists():
        print(f"  ERROR: Source dir not found: {src_dir}")
        return []

    results = []

    for level in levels:
        w, h = calc_dimensions(level)
        folder_name = f"{anim['name']}_L{level:02d}"
        out_dir = BASE_DIR / folder_name

        if dry_run:
            vram_mb = w * h * 4 * anim["count"] / 1024 / 1024
            print(f"  L{level:02d}: {w:4d}x{h:4d} | ~{vram_mb:6.1f} MB VRAM | -> {folder_name}/")
            results.append({
                "level": level,
                "width": w,
                "height": h,
                "folder": folder_name,
                "vram_mb": round(vram_mb, 1),
            })
            continue

        out_dir.mkdir(parents=True, exist_ok=True)
        total_bytes = 0

        for i in range(anim["count"]):
            idx = f"{i:02d}"
            src_file = src_dir / f"{anim['prefix']}{idx}.jpg"
            dst_file = out_dir / f"{anim['prefix']}{idx}.jpg"

            if not src_file.exists():
                print(f"  WARNING: Missing {src_file}")
                continue

            img = Image.open(src_file)
            resized = img.resize((w, h), Image.NEAREST)
            resized.save(dst_file, "JPEG", quality=quality, optimize=True)
            total_bytes += dst_file.stat().st_size

        avg_bytes = total_bytes // anim["count"] if anim["count"] > 0 else 0
        vram_mb = w * h * 4 * anim["count"] / 1024 / 1024

        results.append({
            "level": level,
            "width": w,
            "height": h,
            "folder": folder_name,
            "total_kb": round(total_bytes / 1024),
            "avg_frame_kb": round(avg_bytes / 1024),
            "vram_mb": round(vram_mb, 1),
        })

        print(f"  L{level:02d}: {w:4d}x{h:4d} | {total_bytes // 1024:6d} KB | avg {avg_bytes // 1024:5d} KB/frame | ~{vram_mb:.1f} MB VRAM")

    return results


def main():
    parser = argparse.ArgumentParser(description="Generate multi-resolution animation levels")
    parser.add_argument("--quality", type=int, default=85, help="JPEG quality (default: 85)")
    parser.add_argument("--single-level", type=int, default=None, help="Generate only one level (1-49)")
    parser.add_argument("--dry-run", action="store_true", help="Preview dimensions only, no files")
    parser.add_argument("--skip-start-play", action="store_true", help="Only process start_loop")
    args = parser.parse_args()

    # Determine which levels to generate
    if args.single_level is not None:
        levels = [max(1, min(TOTAL_LEVELS, args.single_level))]
    else:
        levels = list(range(1, TOTAL_LEVELS + 1))

    anims_to_process = ANIMATIONS
    if args.skip_start_play:
        anims_to_process = [ANIMATIONS[0]]

    print(f"{'[DRY RUN] ' if args.dry_run else ''}Generating {len(levels)} level(s) for {len(anims_to_process)} animation(s)")
    print(f"JPEG quality: {args.quality} | Resampling: NEAREST")
    print(f"Output base: {BASE_DIR}\n")

    manifest = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%S"), "quality": args.quality, "animations": {}}
    start_time = time.time()

    for anim in anims_to_process:
        print(f"=== {anim['name']} ({anim['count']} frames) ===")
        results = process_animation(anim, levels, args.quality, args.dry_run)
        manifest["animations"][anim["name"]] = results
        print()

    elapsed = time.time() - start_time
    print(f"Done in {elapsed:.1f}s")

    # Write manifest
    if not args.dry_run:
        manifest_path = BASE_DIR / "anim_levels_manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)
        print(f"Manifest written to: {manifest_path}")


if __name__ == "__main__":
    main()
