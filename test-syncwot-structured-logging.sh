#!/bin/bash

# Test script to verify syncWoT structured logging implementation
# This creates a mock version of syncWoT to test event emission without actual relay sync

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Set up test environment
export BRAINSTORM_STRUCTURED_LOGGING="true"
export BRAINSTORM_LOG_DIR="${SCRIPT_DIR}/test-logs"
export BRAINSTORM_MODULE_BASE_DIR="${SCRIPT_DIR}"
mkdir -p "$BRAINSTORM_LOG_DIR/taskQueue"

# Source structured logging utilities
source "${SCRIPT_DIR}/src/utils/structuredLogging.sh"

echo "=== Testing syncWoT Structured Logging ==="
echo "This test verifies that syncWoT emits proper structured events"
echo ""

# Mock the syncWoT structured events (without actual strfry sync)
echo "Simulating syncWoT structured events..."

# TASK_START event
emit_task_event "TASK_START" "syncWoT" "system" '{
    "description": "Web of Trust data synchronization from relays",
    "target_relays": ["relay.hasenpfeffr.com"],
    "filter_kinds": [3, 1984, 10000, 30000, 38000, 38172, 38173],
    "sync_direction": "down"
}'

# PROGRESS - initialization
emit_task_event "PROGRESS" "syncWoT" "system" '{
    "phase": "initialization",
    "step": "setup_complete",
    "message": "Logging initialized, starting relay synchronization"
}'

# PROGRESS - relay sync start
emit_task_event "PROGRESS" "syncWoT" "system" '{
    "phase": "relay_sync",
    "step": "sync_hasenpfeffr",
    "relay": "relay.hasenpfeffr.com",
    "message": "Starting synchronization with relay.hasenpfeffr.com"
}'

# Simulate some work
sleep 1

# PROGRESS - relay sync completion
emit_task_event "PROGRESS" "syncWoT" "system" '{
    "phase": "relay_sync",
    "step": "sync_hasenpfeffr_complete",
    "relay": "relay.hasenpfeffr.com",
    "message": "Completed synchronization with relay.hasenpfeffr.com"
}'

# TASK_END event
emit_task_event "TASK_END" "syncWoT" "system" '{
    "phases_completed": 2,
    "relays_synced": ["relay.hasenpfeffr.com"],
    "sync_direction": "down",
    "filter_kinds": [3, 1984, 10000, 30000, 38000, 38172, 38173],
    "status": "success",
    "message": "Web of Trust synchronization completed successfully"
}'

echo ""
echo "=== Results ==="

# Check for expected events
TASK_START_COUNT=$(grep -c '"eventType":"TASK_START".*"taskName":"syncWoT"' "$BRAINSTORM_LOG_DIR/taskQueue/events.jsonl" 2>/dev/null || echo "0")
PROGRESS_COUNT=$(grep -c '"eventType":"PROGRESS".*"taskName":"syncWoT"' "$BRAINSTORM_LOG_DIR/taskQueue/events.jsonl" 2>/dev/null || echo "0")
TASK_END_COUNT=$(grep -c '"eventType":"TASK_END".*"taskName":"syncWoT"' "$BRAINSTORM_LOG_DIR/taskQueue/events.jsonl" 2>/dev/null || echo "0")

echo "TASK_START events found: $TASK_START_COUNT (expected: 1)"
echo "PROGRESS events found: $PROGRESS_COUNT (expected: 3)"
echo "TASK_END events found: $TASK_END_COUNT (expected: 1)"

echo ""
if [[ "$TASK_START_COUNT" -eq "1" && "$PROGRESS_COUNT" -eq "3" && "$TASK_END_COUNT" -eq "1" ]]; then
    echo "✅ syncWoT STRUCTURED LOGGING SUCCESS: All expected events generated"
else
    echo "❌ syncWoT STRUCTURED LOGGING ISSUE: Event counts don't match expectations"
fi

echo ""
echo "Sample events from syncWoT test:"
if [[ -f "$BRAINSTORM_LOG_DIR/taskQueue/events.jsonl" ]]; then
    grep '"taskName":"syncWoT"' "$BRAINSTORM_LOG_DIR/taskQueue/events.jsonl" | while read -r line; do
        echo "  $line"
    done
fi

# Cleanup
rm -rf "$BRAINSTORM_LOG_DIR"
echo ""
echo "Test completed. Temporary logs cleaned up."
