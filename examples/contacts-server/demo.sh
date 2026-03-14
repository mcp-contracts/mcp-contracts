#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# mcpdiff demo — contacts server v1 → v2
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI="node $REPO_ROOT/packages/cli/dist/index.js"
SNAPSHOTS="$SCRIPT_DIR/snapshots"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║          mcpdiff demo — contacts server      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Step 1: Inspect the v1 snapshot ──────────────────────────
echo "━━━ Step 1: Inspecting v1.0.0 snapshot ━━━"
echo ""
$CLI inspect "$SNAPSHOTS/v1.0.0.mcpc.json" --tools
echo ""

# ── Step 2: Inspect the v2 snapshot ──────────────────────────
echo "━━━ Step 2: Inspecting v2.0.0 snapshot ━━━"
echo ""
$CLI inspect "$SNAPSHOTS/v2.0.0.mcpc.json" --tools
echo ""

# ── Step 3: Diff v1 → v2 ────────────────────────────────────
echo "━━━ Step 3: Diffing v1.0.0 → v2.0.0 ━━━"
echo ""

# Run diff — allow non-zero exit (breaking changes expected)
$CLI diff "$SNAPSHOTS/v1.0.0.mcpc.json" "$SNAPSHOTS/v2.0.0.mcpc.json" || true
echo ""

# ── Step 4: Show JSON output ─────────────────────────────────
echo "━━━ Step 4: JSON output (for CI/programmatic use) ━━━"
echo ""
$CLI diff "$SNAPSHOTS/v1.0.0.mcpc.json" "$SNAPSHOTS/v2.0.0.mcpc.json" --format json 2>/dev/null || true
echo ""

# ── Step 5: Demonstrate exit codes ───────────────────────────
echo "━━━ Step 5: Exit code behavior ━━━"
echo ""

set +e

$CLI diff "$SNAPSHOTS/v1.0.0.mcpc.json" "$SNAPSHOTS/v2.0.0.mcpc.json" --quiet
echo "  Default (--fail-on breaking): exit code $?"

$CLI diff "$SNAPSHOTS/v1.0.0.mcpc.json" "$SNAPSHOTS/v2.0.0.mcpc.json" --fail-on warning --quiet
echo "  Strict  (--fail-on warning):  exit code $?"

$CLI diff "$SNAPSHOTS/v1.0.0.mcpc.json" "$SNAPSHOTS/v1.0.0.mcpc.json" --quiet
echo "  No changes (same file):       exit code $?"

set -e

echo ""

# ── Step 6: Baseline workflow ────────────────────────────────
echo "━━━ Step 6: Baseline workflow ━━━"
echo ""

TMPDIR=$(mktemp -d)

echo "  Creating baseline from v1 snapshot..."
cp "$SNAPSHOTS/v1.0.0.mcpc.json" "$TMPDIR/baseline.mcpc.json"

echo "  Running 'ci' against matching baseline (should pass)..."
$CLI --format json ci --baseline "$TMPDIR/baseline.mcpc.json" \
  --command node --args "$SCRIPT_DIR/v1/server.js" --quiet > /dev/null 2>&1 && \
  echo "  Result: PASS (exit 0)" || echo "  Result: FAIL (exit $?)"

echo "  Running 'ci' against v2 server with v1 baseline (should fail)..."
set +e
$CLI --format json ci --baseline "$TMPDIR/baseline.mcpc.json" \
  --command node --args "$SCRIPT_DIR/v2/server.js" --quiet > /dev/null 2>&1
echo "  Result: exit code $? (breaking changes detected)"
set -e

rm -rf "$TMPDIR"
echo ""

# ── Step 7: Live diff ─────────────────────────────────────
echo "━━━ Step 7: Live diff (baseline file → live server) ━━━"
echo ""
echo "  Diffing v1 baseline against a live v2 server in one command..."
$CLI diff --live "$SNAPSHOTS/v1.0.0.mcpc.json" \
  --command node --args "$SCRIPT_DIR/v2/server.js" || true
echo ""

# ── Step 8: Webhook notification ──────────────────────────
echo "━━━ Step 8: Webhook notification ━━━"
echo ""

WEBHOOK_RECEIVER="$REPO_ROOT/examples/webhook-receiver/server.js"
WEBHOOK_URL="http://localhost:8089/webhook"

echo "  Starting webhook receiver on port 8089..."
PORT=8089 node "$WEBHOOK_RECEIVER" &
WEBHOOK_PID=$!
sleep 0.5

echo "  Running diff with --webhook..."
$CLI diff "$SNAPSHOTS/v1.0.0.mcpc.json" "$SNAPSHOTS/v2.0.0.mcpc.json" \
  --webhook "$WEBHOOK_URL" --quiet || true

sleep 0.5
echo ""
echo "  Stopping webhook receiver..."
kill $WEBHOOK_PID 2>/dev/null || true
wait $WEBHOOK_PID 2>/dev/null || true
echo ""

# ── Step 9: Watch mode hint ───────────────────────────────
echo "━━━ Step 9: Watch mode (interactive — not run automatically) ━━━"
echo ""
echo "  Watch mode re-diffs your server whenever source files change."
echo "  Try it yourself:"
echo ""
echo "    $CLI watch \\"
echo "      --command node --args $SCRIPT_DIR/v1/server.js \\"
echo "      --baseline $SNAPSHOTS/v1.0.0.mcpc.json \\"
echo "      --watch-paths $SCRIPT_DIR \\"
echo "      --clear"
echo ""
echo "  With webhook notifications:"
echo ""
echo "    $CLI watch \\"
echo "      --command node --args $SCRIPT_DIR/v1/server.js \\"
echo "      --baseline $SNAPSHOTS/v1.0.0.mcpc.json \\"
echo "      --webhook http://localhost:8080/webhook"
echo ""

echo "━━━ Done! ━━━"
echo ""
echo "Try it yourself:"
echo "  $CLI inspect $SNAPSHOTS/v1.0.0.mcpc.json --schema create_contact"
echo "  $CLI diff $SNAPSHOTS/v1.0.0.mcpc.json $SNAPSHOTS/v2.0.0.mcpc.json --format markdown"
echo "  $CLI ci --baseline $SNAPSHOTS/v1.0.0.mcpc.json --command node --args $SCRIPT_DIR/v2/server.js"
echo ""
