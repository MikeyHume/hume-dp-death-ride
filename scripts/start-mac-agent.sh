#!/bin/bash
# start-mac-agent.sh — One-command Mac agent startup
# Usage:
#   ./scripts/start-mac-agent.sh                          # auto-detect first iOS device
#   ./scripts/start-mac-agent.sh --udid <UDID>            # target specific device
#   ./scripts/start-mac-agent.sh --device iphone-xs       # use named device profile
#   ./scripts/start-mac-agent.sh --list                   # show connected iOS devices
#
# This script: pulls latest code, kills stale safaridriver, starts fresh safaridriver,
# launches mac-agent targeting the specified device over HTTP.

set -euo pipefail
cd "$(dirname "$0")/.."

# ── Device profiles (add new devices here) ─────────────────────
declare -A DEVICES=(
  [iphone-xs]="00008020-001345143C52002E"
  # [iphone-12-mini]="UDID_HERE"
  # [ipad-10th]="UDID_HERE"
)

# ── Parse args ─────────────────────────────────────────────────
UDID=""
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --list)
      echo "Connected devices:"
      xcrun xctrace list devices 2>/dev/null | grep -i "iphone\|ipad" || echo "  (none found)"
      echo ""
      echo "Registered profiles:"
      for name in "${!DEVICES[@]}"; do
        echo "  --device $name  →  ${DEVICES[$name]}"
      done
      exit 0
      ;;
    --device)
      shift
      if [[ -n "${DEVICES[$1]:-}" ]]; then
        UDID="${DEVICES[$1]}"
        echo "Using device profile: $1 → $UDID"
      else
        echo "Unknown device: $1"
        echo "Known devices: ${!DEVICES[*]}"
        exit 1
      fi
      shift
      ;;
    --udid)
      shift
      UDID="$1"
      shift
      ;;
    *)
      EXTRA_ARGS+=("$1")
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
safaridriver -p 4723 &
SAFARI_PID=$!
sleep 2

# Verify it started
if ! kill -0 $SAFARI_PID 2>/dev/null; then
  echo "ERROR: safaridriver failed to start. Run: sudo safaridriver --enable"
  exit 1
fi
echo "safaridriver running (PID $SAFARI_PID)"

# ── Build mac-agent command ────────────────────────────────────
CMD=(node scripts/mac-agent.mjs)
if [[ -n "$UDID" ]]; then
  CMD+=(--udid "$UDID")
fi
CMD+=("${EXTRA_ARGS[@]}")

echo ""
echo "Starting mac-agent..."
echo "  ${CMD[*]}"
echo ""

# ── Run mac-agent (foreground — Ctrl+C stops both) ─────────────
cleanup() {
  echo ""
  echo "Shutting down..."
  kill $SAFARI_PID 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

"${CMD[@]}"
