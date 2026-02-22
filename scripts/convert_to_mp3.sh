#!/bin/bash
DIR="C:/Users/mikey/Claude_Playground/dp_moto/public/assets/audio/music/Rythem_Songs"
BITRATE="192k"
converted=0
reencoded=0
errors=0

echo "Converting all tracks to ${BITRATE} MP3..."
echo ""

cd "$DIR"

# Step 1: Convert WAV -> MP3, then delete WAV
echo "=== Converting WAV to MP3 ==="
for f in *.wav; do
  [ -f "$f" ] || continue
  out="${f%.wav}.mp3"
  echo -n "  WAV->MP3: $f ... "
  if ffmpeg -y -i "$f" -codec:a libmp3lame -b:a $BITRATE -map_metadata -1 "$out" 2>/dev/null; then
    rm "$f"
    echo "OK"
    converted=$((converted + 1))
  else
    echo "ERROR"
    errors=$((errors + 1))
  fi
done

echo ""

# Step 2: Re-encode existing MP3s that are above 200kbps
echo "=== Re-encoding high-bitrate MP3s ==="
for f in *.mp3; do
  [ -f "$f" ] || continue
  br=$(ffprobe -v quiet -show_entries format=bit_rate -of csv=p=0 "$f" 2>/dev/null)
  # If bitrate > 200000, re-encode
  if [ -n "$br" ] && [ "$br" -gt 200000 ] 2>/dev/null; then
    echo -n "  Re-encode ($((br/1000))k -> 192k): $f ... "
    tmp="${f}.tmp.mp3"
    if ffmpeg -y -i "$f" -codec:a libmp3lame -b:a $BITRATE -map_metadata -1 "$tmp" 2>/dev/null; then
      mv "$tmp" "$f"
      echo "OK"
      reencoded=$((reencoded + 1))
    else
      rm -f "$tmp"
      echo "ERROR"
      errors=$((errors + 1))
    fi
  fi
done

echo ""
echo "=========================================="
echo "WAV -> MP3 converted: $converted"
echo "MP3 re-encoded:       $reencoded"
echo "Errors:               $errors"
echo "=========================================="
echo ""
echo "Final stats:"
echo "  Files: $(ls *.mp3 2>/dev/null | wc -l)"
echo "  Total: $(du -sh . | cut -f1)"
