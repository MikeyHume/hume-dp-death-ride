#!/bin/bash
# start-mac-agent.sh — One-command Mac agent startup (Bash 3.2+ compatible)
# Usage:
#   ./scripts/start-mac-agent.sh                          # auto-detect first iOS device
#   ./scripts/start-mac-agent.sh --udid <UDID>            # target specific device
#   ./scripts/start-mac-agent.sh --device iphone-xs       # use named device profile
#   ./scripts/start-mac-agent.sh --list                   # show connected iOS devices
#   ./scripts/start-mac-agent.sh --pc-host 192.168.1.203  # override PC IP
#
# This script: pulls latest code, kills stale safaridriver, starts fresh safaridriver,
# launches mac-agent targeting the specified device over HTTP.

set -euo pipefail

# ── Deterministic PATH (non-interactive SSH may not source profiles) ──
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd "$(dirname "$0")/.."

# ── Device profiles (Bash 3.2 compatible — no associative arrays) ──
# Add new devices as new cases below.
resolve_device() {
  case "$1" in
    iphone-xs)       echo "00008020-001345143C52002E" ;;
    # iphone-12-mini) echo "UDID_HERE" ;;
    # ipad-10th)      echo "UDID_HERE" ;;
    *)               echo "" ;;
  esac
}

list_profiles() {
  echo "  --device iphone-xs       → 00008020-001345143C52002E"
  # echo "  --device iphone-12-mini  → UDID_HERE"
  # echo "  --device ipad-10th       → UDID_HERE"
}

# ── Parse args ─────────────────────────────────────────────────
UDID=""
EXTRA_ARGS=""

while [ $# -gt 0 ]; do
  case "$1" in
    --list)
      echo "Connected devices:"
      xcrun xctrace list devices 2>/dev/null | grep -i "iphone\|ipad" || echo "  (none found)"
      echo ""
      echo "Registered profiles:"
      list_profiles
      exit 0
      ;;
    --device)
      shift
      UDID="$(resolve_device "$1")"
      if [ -z "$UDID" ]; then
        echo "Unknown device: $1"
        echo "Known devices:"
        list_profiles
        exit 1
      fi
      echo "Using device profile: $1 → $UDID"
      shift
      ;;
    --udid)
      shift
      UDID="$1"
      shift
      ;;
    *)
      EXTRA_ARGS="$EXTRA_ARGS $1"
      shift
      ;;
  esac
done

# ── Pull latest code ───────────────────────────────────────────
echo "Pulling latest code..."
git pull --ff-only || echo "  (pull skipped — may have local changes)"

# ── Kill stale safaridriver ────────────────────────────────────
if pgrep -x safaridriver > /dev/null 2>&1; then
  echo "Killing stale safaridriver..."
  pkill -x safaridriver || true
  sleep 1
fi

# ── Start safaridriver ─────────────────────────────────────────
echo "Starting safaridriver on port 4723..."
nohup bash -c "safaridriver -p 4723" &>/tmp/safaridriver.log &
sleep 3

# Verify it started
SAFARI_PID=$(pgrep -x safaridriver)
if [ -z "$SAFARI_PID" ]; then
  echo "ERROR: safaridriver failed to start. Run: sudo safaridriver --enable"
  echo "Log: $(cat /tmp/safaridriver.log 2>/dev/null)"
  exit 1
fi
echo "safaridriver running (PID $SAFARI_PID)"

# ── Build mac-agent command ────────────────────────────────────
CMD="/usr/local/bin/node scripts/mac-agent.mjs"
if [ -n "$UDID" ]; then
  CMD="$CMD --udid $UDID"
fi
CMD="$CMD $EXTRA_ARGS"

echo ""
echo "Starting mac-agent..."
echo "  $CMD"
echo ""

# ── Run mac-agent (foreground — Ctrl+C stops both) ─────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $SAFARI_PID 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

$CMD
