#!/bin/bash
# ============================================================
# Supabase Backup Script
# Pulls table data from Supabase REST API -> local JSON files
#
# Usage:
#   bash scripts/backup_supabase.sh          # back up user/leaderboard tables only
#   bash scripts/backup_supabase.sh --all    # also back up music catalog tables
# ============================================================

PROJECT_ROOT="C:/Users/mikey/Claude_Playground/dp_moto"
BACKUP_DIR="$PROJECT_ROOT/backups/supabase"
ENV_FILE="$PROJECT_ROOT/.env.local"

# Read env vars
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi

SUPABASE_URL=$(grep VITE_SUPABASE_URL "$ENV_FILE" | cut -d= -f2- | tr -d ' \r')
ANON_KEY=$(grep VITE_SUPABASE_ANON_KEY "$ENV_FILE" | cut -d= -f2- | tr -d ' \r')

if [ -z "$SUPABASE_URL" ] || [ -z "$ANON_KEY" ]; then
  echo "ERROR: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

backed_up=0
errors=0

backup_table() {
  local table="$1"
  local order="${2:-id.asc}"
  local outfile="$BACKUP_DIR/$table.json"

  echo -n "  $table ... "

  curl -sf "$SUPABASE_URL/rest/v1/$table?order=$order&limit=10000" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    | node -e "
      const fs = require('fs'), path = require('path');
      let d = '';
      process.stdin.on('data', c => d += c);
      process.stdin.on('end', () => {
        try {
          const rows = JSON.parse(d);
          if (!Array.isArray(rows)) { process.stdout.write('ERROR: unexpected response\n'); process.exit(1); }
          const out = path.join(process.argv[1], process.argv[2] + '.json');
          fs.writeFileSync(out, JSON.stringify(rows, null, 2));
          process.stdout.write(rows.length + ' rows\n');
        } catch(e) { process.stdout.write('ERROR: ' + e.message + '\n'); process.exit(1); }
      });
    " "$BACKUP_DIR" "$table"

  if [ $? -eq 0 ]; then
    backed_up=$((backed_up + 1))
  else
    errors=$((errors + 1))
  fi
}

echo "Supabase Backup — $(date '+%Y-%m-%d %H:%M:%S')"
echo "Target: $BACKUP_DIR"
echo ""

# Always back up: user data + leaderboards
echo "=== User & Leaderboard Tables ==="
backup_table "profiles" "user_id.asc"
backup_table "leaderboard_entries" "id.asc"
backup_table "leaderboard_archive" "id.asc"
backup_table "user_favorites" "created_at.asc"
backup_table "user_playlists" "id.asc"
backup_table "user_playlist_tracks" "playlist_id.asc,added_at.asc"
backup_table "rhythm_courses" "id.asc"
backup_table "rhythm_scores" "id.asc"

# Only back up music catalog if --all flag passed
if [ "$1" = "--all" ]; then
  echo ""
  echo "=== Music Catalog Tables ==="
  backup_table "music_artists" "name.asc"
  backup_table "music_tracks" "artist_name.asc,title.asc"
fi

echo ""
echo "=========================================="
echo "Backed up: $backed_up tables"
echo "Errors:    $errors"
echo "Total size: $(du -sh "$BACKUP_DIR" | cut -f1)"
echo "=========================================="
