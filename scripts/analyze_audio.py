"""
Audio analysis pipeline for DP Moto music-reactive visuals.

Downloads audio from YouTube, runs multi-band spectral analysis with librosa,
and outputs compact JSON beat maps per track for runtime playback sync.

Usage:
  python scripts/analyze_audio.py                    # analyze all tracks
  python scripts/analyze_audio.py --limit 3          # test with 3 tracks
  python scripts/analyze_audio.py --track <spotify_id>  # single track

Output: scripts/beat_data/<spotify_track_id>.json per track

Each JSON contains timestamped arrays at RESOLUTION_MS intervals:
  - bass, low_mid, mid, high_mid, high  (frequency band energy, 0-1)
  - energy       (overall RMS loudness, 0-1)
  - percussive   (percussive/transient energy — drums, snare, hats, 0-1)
  - harmonic     (harmonic/tonal energy — synths, vocals, guitars, 0-1)
  - centroid     (spectral centroid in Hz — "brightness" of the sound)
  - beats        (beat timestamps in seconds)
  - onsets       (onset/transient timestamps in seconds)
  - bpm          (estimated tempo)
  - duration_s   (track duration in seconds)
  - resolution_ms (time between samples)
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

# Lazy imports for speed — only load librosa when needed
_librosa = None
def get_librosa():
    global _librosa
    if _librosa is None:
        import librosa
        _librosa = librosa
    return _librosa

# ── Config ──
RESOLUTION_MS = 50        # 20 samples/sec
HOP_LENGTH = 512          # librosa hop length (at 22050 sr → ~23ms per frame)
SR = 22050                # sample rate for analysis

# Frequency band edges (Hz)
BANDS = {
    'bass':     (20,   200),
    'low_mid':  (200,  800),
    'mid':      (800,  2500),
    'high_mid': (2500, 6000),
    'high':     (6000, 20000),
}

SCRIPT_DIR = Path(__file__).parent
OUTPUT_DIR = SCRIPT_DIR / 'beat_data'
TEMP_DIR = SCRIPT_DIR / 'temp_audio'


def fetch_tracks_from_supabase():
    """Read track list from the catalog query output (or query Supabase directly)."""
    # For now, read from a cached JSON if available, otherwise use the hardcoded list
    cache_file = SCRIPT_DIR / 'track_catalog.json'
    if cache_file.exists():
        with open(cache_file) as f:
            return json.load(f)
    print("ERROR: No track_catalog.json found. Run with --catalog-file or create it first.")
    sys.exit(1)


def download_audio(youtube_id: str, out_path: str) -> bool:
    """Download audio-only from YouTube using yt-dlp. Returns True on success."""
    cmd = [
        sys.executable, '-m', 'yt_dlp',
        '--no-playlist',
        '-x',                        # extract audio
        '--audio-format', 'wav',     # wav for easy librosa loading
        '--audio-quality', '0',      # best quality
        '-o', out_path,
        '--no-warnings',
        '--quiet',
        f'https://www.youtube.com/watch?v={youtube_id}',
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"  yt-dlp error: {result.stderr.strip()[:200]}")
            return False
        return True
    except subprocess.TimeoutExpired:
        print(f"  yt-dlp timeout for {youtube_id}")
        return False
    except FileNotFoundError:
        print("ERROR: yt-dlp not found. Install with: pip install yt-dlp")
        sys.exit(1)


def analyze_track(audio_path: str) -> dict:
    """Run full multi-band spectral analysis on an audio file."""
    librosa = get_librosa()

    # Load audio (mono, resampled to SR)
    y, sr = librosa.load(audio_path, sr=SR, mono=True)
    duration_s = len(y) / sr

    # ── Harmonic/Percussive separation ──
    y_harmonic, y_percussive = librosa.effects.hpss(y)

    # ── Compute STFT for band energy ──
    S = np.abs(librosa.stft(y, hop_length=HOP_LENGTH))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2 * (S.shape[0] - 1))
    n_frames = S.shape[1]

    # Time axis for STFT frames
    frame_times = librosa.frames_to_time(np.arange(n_frames), sr=sr, hop_length=HOP_LENGTH)

    # ── Band energy extraction ──
    band_energies = {}
    for band_name, (lo, hi) in BANDS.items():
        mask = (freqs >= lo) & (freqs < hi)
        if mask.sum() == 0:
            band_energies[band_name] = np.zeros(n_frames)
        else:
            band_energies[band_name] = np.mean(S[mask, :] ** 2, axis=0)

    # ── Overall RMS energy ──
    rms = librosa.feature.rms(y=y, hop_length=HOP_LENGTH)[0]

    # ── Percussive RMS (drums, snare, hats) ──
    rms_perc = librosa.feature.rms(y=y_percussive, hop_length=HOP_LENGTH)[0]

    # ── Harmonic RMS (synths, vocals, guitars) ──
    rms_harm = librosa.feature.rms(y=y_harmonic, hop_length=HOP_LENGTH)[0]

    # ── Spectral centroid (brightness) ──
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=HOP_LENGTH)[0]

    # ── Beat tracking ──
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=HOP_LENGTH)
    # tempo may be an array in newer librosa
    if hasattr(tempo, '__len__'):
        bpm = float(tempo[0]) if len(tempo) > 0 else 120.0
    else:
        bpm = float(tempo)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=HOP_LENGTH)

    # ── Onset detection (transient hits) ──
    onset_frames = librosa.onset.onset_detect(y=y, sr=sr, hop_length=HOP_LENGTH)
    onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=HOP_LENGTH)

    # ── Onset strength envelope (continuous "attackiness") ──
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP_LENGTH)

    # ── Resample all continuous signals to fixed RESOLUTION_MS intervals ──
    target_times = np.arange(0, duration_s, RESOLUTION_MS / 1000.0)
    n_samples = len(target_times)

    def resample_to_fixed(signal, source_times):
        """Interpolate a signal from source_times to target_times."""
        # Ensure same length
        min_len = min(len(signal), len(source_times))
        return np.interp(target_times, source_times[:min_len], signal[:min_len])

    # Resample band energies
    resampled_bands = {}
    for band_name, energy in band_energies.items():
        resampled = resample_to_fixed(energy, frame_times)
        # Normalize to 0-1 range (per-track, using 99th percentile to avoid outlier spikes)
        p99 = np.percentile(resampled, 99) if len(resampled) > 0 else 1.0
        if p99 > 0:
            resampled = np.clip(resampled / p99, 0, 1)
        resampled_bands[band_name] = resampled

    # Resample RMS / percussive / harmonic / centroid / onset_env
    rms_resampled = resample_to_fixed(rms, frame_times)
    perc_resampled = resample_to_fixed(rms_perc, frame_times)
    harm_resampled = resample_to_fixed(rms_harm, frame_times)
    cent_resampled = resample_to_fixed(centroid, frame_times)
    onset_env_resampled = resample_to_fixed(onset_env, frame_times)

    # Normalize continuous signals to 0-1
    def norm01(arr):
        p99 = np.percentile(arr, 99) if len(arr) > 0 else 1.0
        if p99 > 0:
            return np.clip(arr / p99, 0, 1)
        return arr

    rms_resampled = norm01(rms_resampled)
    perc_resampled = norm01(perc_resampled)
    harm_resampled = norm01(harm_resampled)
    onset_env_resampled = norm01(onset_env_resampled)
    # Centroid stays in Hz (not normalized) — useful for color mapping

    # ── Quantize to uint8 (0-255) for compact storage ──
    def to_uint8_list(arr):
        return (np.clip(arr, 0, 1) * 255).astype(np.uint8).tolist()

    result = {
        'resolution_ms': RESOLUTION_MS,
        'duration_s': round(duration_s, 3),
        'bpm': round(bpm, 1),
        'sample_count': n_samples,
        'bands': {
            'bass':     to_uint8_list(resampled_bands['bass']),
            'low_mid':  to_uint8_list(resampled_bands['low_mid']),
            'mid':      to_uint8_list(resampled_bands['mid']),
            'high_mid': to_uint8_list(resampled_bands['high_mid']),
            'high':     to_uint8_list(resampled_bands['high']),
        },
        'energy':     to_uint8_list(rms_resampled),
        'percussive': to_uint8_list(perc_resampled),
        'harmonic':   to_uint8_list(harm_resampled),
        'onset_env':  to_uint8_list(onset_env_resampled),
        'centroid':   [round(float(c), 1) for c in cent_resampled],
        'beats':      [round(float(t), 3) for t in beat_times],
        'onsets':     [round(float(t), 3) for t in onset_times],
    }
    return result


def process_track(track: dict, force: bool = False) -> bool:
    """Download and analyze a single track. Returns True on success."""
    spotify_id = track['spotify_track_id']
    yt_id = track['youtube_video_id']
    title = track.get('title', '?')
    artist = track.get('artist_name', '?')

    out_file = OUTPUT_DIR / f'{spotify_id}.json'
    if out_file.exists() and not force:
        print(f"  SKIP {artist} - {title} (already analyzed)")
        return True

    print(f"  [{artist}] {title}  (YT: {yt_id})")

    # Check if another track with the same YT ID was already analyzed
    # (slowed/sped variants share the same YT video)
    yt_cache_file = OUTPUT_DIR / f'_yt_{yt_id}.json'
    if yt_cache_file.exists() and not force:
        # Reuse cached analysis
        with open(yt_cache_file) as f:
            analysis = json.load(f)
        analysis['spotify_track_id'] = spotify_id
        with open(out_file, 'w') as f:
            json.dump(analysis, f, separators=(',', ':'))
        print(f"    -> reused YT cache")
        return True

    # Download audio
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    audio_path = str(TEMP_DIR / f'{yt_id}.wav')

    if not os.path.exists(audio_path):
        print(f"    downloading...")
        if not download_audio(yt_id, audio_path):
            print(f"    FAILED to download")
            return False

    # Analyze
    print(f"    analyzing...")
    try:
        analysis = analyze_track(audio_path)
    except Exception as e:
        print(f"    FAILED to analyze: {e}")
        return False

    # Save per-track output
    analysis['spotify_track_id'] = spotify_id
    with open(out_file, 'w') as f:
        json.dump(analysis, f, separators=(',', ':'))

    # Cache by YT ID for reuse by variants
    yt_analysis = dict(analysis)
    del yt_analysis['spotify_track_id']
    with open(yt_cache_file, 'w') as f:
        json.dump(yt_analysis, f, separators=(',', ':'))

    # Clean up audio file to save disk space
    try:
        os.remove(audio_path)
    except OSError:
        pass

    size_kb = out_file.stat().st_size / 1024
    print(f"    -> {analysis['sample_count']} samples, {analysis['bpm']} BPM, {size_kb:.1f} KB")
    return True


def main():
    parser = argparse.ArgumentParser(description='Analyze audio for music-reactive visuals')
    parser.add_argument('--limit', type=int, help='Max tracks to process')
    parser.add_argument('--track', type=str, help='Single Spotify track ID to process')
    parser.add_argument('--force', action='store_true', help='Re-analyze even if output exists')
    parser.add_argument('--catalog-file', type=str, default=str(SCRIPT_DIR / 'track_catalog.json'),
                        help='Path to track catalog JSON')
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load catalog
    catalog_file = Path(args.catalog_file)
    if not catalog_file.exists():
        print(f"Catalog file not found: {catalog_file}")
        print("Creating from Supabase query output...")
        sys.exit(1)

    with open(catalog_file) as f:
        tracks = json.load(f)

    print(f"Loaded {len(tracks)} tracks from catalog")

    # Filter
    if args.track:
        tracks = [t for t in tracks if t['spotify_track_id'] == args.track]
        if not tracks:
            print(f"Track {args.track} not found in catalog")
            sys.exit(1)

    if args.limit:
        tracks = tracks[:args.limit]

    # Process
    success = 0
    failed = 0
    skipped = 0
    for i, track in enumerate(tracks):
        print(f"\n[{i+1}/{len(tracks)}]", end='')
        result = process_track(track, force=args.force)
        if result:
            out_file = OUTPUT_DIR / f'{track["spotify_track_id"]}.json'
            if out_file.exists():
                success += 1
            else:
                skipped += 1
        else:
            failed += 1

    print(f"\n{'='*60}")
    print(f"Done! {success} analyzed, {skipped} skipped, {failed} failed")
    print(f"Output: {OUTPUT_DIR}/")

    # Clean up temp dir
    if TEMP_DIR.exists():
        for f in TEMP_DIR.iterdir():
            try:
                f.unlink()
            except OSError:
                pass
        try:
            TEMP_DIR.rmdir()
        except OSError:
            pass


if __name__ == '__main__':
    main()
