"""
Extract dominant color from Spotify album art thumbnails.

Fetches album_image_url for each track in the catalog, runs ColorThief
to find the dominant color, and updates the music_tracks table in Supabase.

Usage:
  python scripts/extract_dominant_colors.py              # all tracks
  python scripts/extract_dominant_colors.py --force      # re-extract even if already set
  python scripts/extract_dominant_colors.py --dry-run    # preview without writing to DB

Output: Updates music_tracks.dominant_color with hex strings like '#cc44aa'
"""

import argparse
import io
import json
import os
import sys
from pathlib import Path
from urllib.request import urlopen, Request

from colorthief import ColorThief

SCRIPT_DIR = Path(__file__).parent

# Load Supabase credentials from .env.local
def load_env():
    env_file = SCRIPT_DIR.parent / '.env.local'
    env = {}
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env


def fetch_tracks_from_supabase(url: str, anon_key: str) -> list:
    """Fetch all tracks with album_image_url from Supabase."""
    api_url = f"{url}/rest/v1/music_tracks?select=spotify_track_id,title,artist_name,album_image_url,dominant_color&order=title"
    req = Request(api_url, headers={
        'apikey': anon_key,
        'Authorization': f'Bearer {anon_key}',
    })
    with urlopen(req) as resp:
        return json.loads(resp.read().decode())


def update_dominant_color(url: str, anon_key: str, spotify_track_id: str, color: str) -> bool:
    """Update dominant_color for a track in Supabase."""
    import urllib.parse
    api_url = f"{url}/rest/v1/music_tracks?spotify_track_id=eq.{urllib.parse.quote(spotify_track_id)}"
    data = json.dumps({'dominant_color': color}).encode()
    req = Request(api_url, data=data, method='PATCH', headers={
        'apikey': anon_key,
        'Authorization': f'Bearer {anon_key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    })
    try:
        with urlopen(req) as resp:
            return resp.status in (200, 204)
    except Exception as e:
        print(f"    UPDATE ERROR: {e}")
        return False


def extract_dominant_color(image_url: str) -> str | None:
    """Download image and extract dominant color as hex string."""
    try:
        req = Request(image_url, headers={
            'User-Agent': 'Mozilla/5.0',
        })
        with urlopen(req, timeout=15) as resp:
            img_bytes = resp.read()
        ct = ColorThief(io.BytesIO(img_bytes))
        r, g, b = ct.get_color(quality=1)
        return f'#{r:02x}{g:02x}{b:02x}'
    except Exception as e:
        print(f"    EXTRACT ERROR: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description='Extract dominant colors from album art')
    parser.add_argument('--force', action='store_true', help='Re-extract even if already set')
    parser.add_argument('--dry-run', action='store_true', help='Preview without writing to DB')
    args = parser.parse_args()

    env = load_env()
    sb_url = env.get('VITE_SUPABASE_URL')
    sb_key = env.get('VITE_SUPABASE_ANON_KEY')
    if not sb_url or not sb_key:
        print("ERROR: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local")
        sys.exit(1)

    print("Fetching tracks from Supabase...")
    tracks = fetch_tracks_from_supabase(sb_url, sb_key)
    print(f"Found {len(tracks)} tracks")

    success = 0
    skipped = 0
    failed = 0
    no_art = 0

    for i, t in enumerate(tracks):
        sid = t['spotify_track_id']
        title = t.get('title', '?')
        artist = t.get('artist_name', '?')
        art_url = t.get('album_image_url')
        existing = t.get('dominant_color')

        if existing and not args.force:
            skipped += 1
            continue

        if not art_url:
            no_art += 1
            continue

        print(f"[{i+1}/{len(tracks)}] {artist} - {title}")
        color = extract_dominant_color(art_url)
        if not color:
            failed += 1
            continue

        print(f"    -> {color}")

        if not args.dry_run:
            ok = update_dominant_color(sb_url, sb_key, sid, color)
            if ok:
                success += 1
            else:
                failed += 1
        else:
            success += 1

    print(f"\n{'='*60}")
    print(f"Done! {success} extracted, {skipped} skipped, {failed} failed, {no_art} no art")


if __name__ == '__main__':
    main()
