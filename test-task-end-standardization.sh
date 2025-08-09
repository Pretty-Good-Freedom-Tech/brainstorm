#!/bin/bash

# Test script to verify TASK_END standardization
# This tests that end_task_timer() now emits TASK_END instead of TASK_COMPLETE

# Source the structured logging utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/src/utils/structuredLogging.sh"

echo "=== Testing TASK_END Standardization ==="
echo "This test verifies that end_task_timer() now emits TASK_END events"
echo ""

# Set up test environment
export BRAINSTORM_STRUCTURED_LOGGING="true"
export BRAINSTORM_LOG_DIR="${SCRIPT_DIR}/test-logs"
mkdir -p "$BRAINSTORM_LOG_DIR/taskQueue"

# Test 1: Successful task completion
echo "Test 1: Testing successful task completion..."
TIMER=$(start_task_timer "testStandardization" "test-target" '{"test":"standardization"}')
sleep 1
end_task_timer "testStandardization" "test-target" "0" "$TIMER" '{"test":"completed"}'

# Test 2: Failed task completion  
echo "Test 2: Testing failed task completion..."
TIMER2=$(start_task_timer "testStandardizationFail" "test-target-fail" '{"test":"standardization"}')
sleep 1
end_task_timer "testStandardizationFail" "test-target-fail" "1" "$TIMER2" '{"test":"failed"}'

echo ""
echo "=== Results ==="
echo "Checking events.jsonl for TASK_END events (should find 2):"
TASK_END_COUNT=$(grep -c '"eventType":"TASK_END"' "$BRAINSTORM_LOG_DIR/taskQueue/events.jsonl" 2>/dev/null || echo "0")
echo "TASK_END events found: $TASK_END_COUNT"

echo ""
echo "Checking events.jsonl for TASK_ERROR events (should find 1):"
TASK_ERROR_COUNT=$(grep -c '"eventType":"TASK_ERROR"' "$BRAINSTORM_LOG_DIR/taskQueue/events.jsonl" 2>/dev/null || echo "0")
echo "TASK_ERROR events found: $TASK_ERROR_COUNT"

echo ""
echo "Checking events.jsonl for TASK_COMPLETE events (should find 0):"
TASK_COMPLETE_COUNT=$(grep -c '"eventType":"TASK_COMPLETE"' "$BRAINSTORM_LOG_DIR/taskQueue/events.jsonl" 2>/dev/null || echo "0")
echo "TASK_COMPLETE events found: $TASK_COMPLETE_COUNT"

echo ""
if [[ "$TASK_END_COUNT" -eq "1" && "$TASK_ERROR_COUNT" -eq "1" && "$TASK_COMPLETE_COUNT" -eq "0" ]]; then
    echo "✅ STANDARDIZATION SUCCESS: end_task_timer() now emits TASK_END/TASK_ERROR instead of TASK_COMPLETE"
else
    echo "❌ STANDARDIZATION ISSUE: Expected 1 TASK_END, 1 TASK_ERROR, 0 TASK_COMPLETE"
fi

echo ""
echo "Sample events from the test:"
if [[ -f "$BRAINSTORM_LOG_DIR/taskQueue/events.jsonl" ]]; then
    tail -4 "$BRAINSTORM_LOG_DIR/taskQueue/events.jsonl" | while read -r line; do
        echo "  $line"
    done
fi

# Cleanup
rm -rf "$BRAINSTORM_LOG_DIR"
echo ""
echo "Test completed. Temporary logs cleaned up."
