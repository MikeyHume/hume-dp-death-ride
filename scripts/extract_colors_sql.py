"""
Extract dominant colors from album art and output SQL UPDATE statements.
Reads track data from Supabase, extracts colors via ColorThief,
prints SQL that can be applied via MCP.
"""
import io
import json
import sys
from urllib.request import urlopen, Request
from colorthief import ColorThief
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent

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

def main():
    env = load_env()
    sb_url = env.get('VITE_SUPABASE_URL')
    sb_key = env.get('VITE_SUPABASE_ANON_KEY')
    if not sb_url or not sb_key:
        print("ERROR: Missing env vars", file=sys.stderr)
        sys.exit(1)

    api_url = f"{sb_url}/rest/v1/music_tracks?select=spotify_track_id,title,artist_name,album_image_url&order=artist_name,title"
    req = Request(api_url, headers={
        'apikey': sb_key,
        'Authorization': f'Bearer {sb_key}',
    })
    with urlopen(req) as resp:
        tracks = json.loads(resp.read().decode())

    print(f"-- Extracting dominant colors for {len(tracks)} tracks", file=sys.stderr)

    results = []
    for i, t in enumerate(tracks):
        sid = t['spotify_track_id']
        art_url = t.get('album_image_url')
        if not art_url:
            print(f"[{i+1}/{len(tracks)}] SKIP (no art): {t.get('artist_name')} - {t.get('title')}", file=sys.stderr)
            continue

        try:
            req = Request(art_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urlopen(req, timeout=15) as resp:
                img_bytes = resp.read()
            ct = ColorThief(io.BytesIO(img_bytes))
            r, g, b = ct.get_color(quality=1)
            color = f'#{r:02x}{g:02x}{b:02x}'
            results.append((sid, color, t.get('artist_name', '?'), t.get('title', '?')))
            print(f"[{i+1}/{len(tracks)}] {t.get('artist_name')} - {t.get('title')} -> {color}", file=sys.stderr)
        except Exception as e:
            print(f"[{i+1}/{len(tracks)}] ERROR: {t.get('artist_name')} - {t.get('title')}: {e}", file=sys.stderr)

    # Output as JSON for easy parsing
    output = []
    for sid, color, artist, title in results:
        output.append({"id": sid, "color": color, "artist": artist, "title": title})

    print(json.dumps(output))
    print(f"\n-- Done: {len(results)} colors extracted", file=sys.stderr)

if __name__ == '__main__':
    main()
