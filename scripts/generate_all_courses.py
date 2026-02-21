"""
Batch Course Generator — generates Easy/Normal/Hard courses for ALL tracks.

Reads all beat data files from public/beat_data/ and runs generate_courses.py
for each track. Skips tracks that already have all 3 difficulty files.

Usage:
  python scripts/generate_all_courses.py
  python scripts/generate_all_courses.py --force          # regenerate all
  python scripts/generate_all_courses.py --max-attempts 30
  python scripts/generate_all_courses.py --target-score 9.0
"""

import json
import os
import subprocess
import sys
import time
from pathlib import Path

BEAT_DIR = Path('public/beat_data')
OUTPUT_DIR = Path('public/courses')
DIFFICULTIES = ['easy', 'normal', 'hard']


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Batch generate rhythm mode courses')
    parser.add_argument('--force', action='store_true',
                        help='Regenerate even if course files exist')
    parser.add_argument('--max-attempts', type=int, default=50,
                        help='Max regeneration attempts per course')
    parser.add_argument('--target-score', type=float, default=9.60,
                        help='Target quality score')
    parser.add_argument('--verbose', '-v', action='store_true')
    args = parser.parse_args()

    # Find all beat data files
    beat_files = sorted(BEAT_DIR.glob('*.json'))
    if not beat_files:
        print(f"No beat data files found in {BEAT_DIR}")
        sys.exit(1)

    print(f"Found {len(beat_files)} tracks with beat data")
    print(f"Target score: {args.target_score}, Max attempts: {args.max_attempts}")
    print(f"Force regenerate: {args.force}")
    print()

    total = len(beat_files)
    skipped = 0
    generated = 0
    failed = 0
    scores = []
    start_time = time.time()

    for i, bf in enumerate(beat_files, 1):
        track_id = bf.stem
        course_dir = OUTPUT_DIR / track_id

        # Check if all difficulties already exist
        if not args.force:
            existing = [d for d in DIFFICULTIES if (course_dir / f'{d}.json').exists()]
            if len(existing) == 3:
                skipped += 1
                continue

        print(f"[{i}/{total}] {track_id}")

        try:
            cmd = [
                sys.executable, 'scripts/generate_courses.py',
                '--track', track_id,
                '--all-difficulties',
                '--max-attempts', str(args.max_attempts),
                '--target-score', str(args.target_score),
            ]
            if args.verbose:
                cmd.append('--verbose')

            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=300
            )

            if result.returncode != 0:
                print(f"  FAILED: {result.stderr.strip()[:200]}")
                failed += 1
                continue

            # Read back scores from generated files
            track_scores = {}
            for diff in DIFFICULTIES:
                course_file = course_dir / f'{diff}.json'
                if course_file.exists():
                    with open(course_file) as f:
                        data = json.load(f)
                    track_scores[diff] = data['score']['total']

            if track_scores:
                avg = sum(track_scores.values()) / len(track_scores)
                scores.append(avg)
                score_str = '  '.join(f"{d}={track_scores.get(d, 0):.2f}" for d in DIFFICULTIES)
                print(f"  OK: {score_str}  (avg={avg:.2f})")
                generated += 1
            else:
                print(f"  WARN: No output files found")
                failed += 1

        except subprocess.TimeoutExpired:
            print(f"  TIMEOUT (>300s)")
            failed += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            failed += 1

    elapsed = time.time() - start_time
    print()
    print(f"{'='*60}")
    print(f"BATCH COMPLETE in {elapsed:.1f}s")
    print(f"  Generated: {generated}")
    print(f"  Skipped:   {skipped} (already existed)")
    print(f"  Failed:    {failed}")
    if scores:
        print(f"  Avg score: {sum(scores)/len(scores):.2f}")
        print(f"  Min score: {min(scores):.2f}")
        print(f"  Max score: {max(scores):.2f}")
        below_target = sum(1 for s in scores if s < args.target_score)
        print(f"  Below {args.target_score}: {below_target}/{len(scores)}")
    print(f"  Total courses: {generated * 3 + skipped * 3}")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
