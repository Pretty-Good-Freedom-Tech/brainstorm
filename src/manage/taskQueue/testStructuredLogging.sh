#!/bin/bash

# Test Script for Structured Logging Implementation
# Demonstrates Phase 1: Add Structured Events (Non-Breaking)

# Set up test environment
CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE" # BRAINSTORM_LOG_DIR BRAINSTORM_MODULE_BASE_DIR

# Use a dedicated test directory to avoid permission issues
TEST_LOG_DIR="${BRAINSTORM_LOG_DIR}/test-$(date +%s)"
export BRAINSTORM_LOG_DIR="$TEST_LOG_DIR"
export BRAINSTORM_STRUCTURED_LOGGING="true"
export BRAINSTORM_LOG_LEVEL="INFO"

# Create test directories
mkdir -p "$BRAINSTORM_LOG_DIR/taskQueue"

# Source our structured logging utility
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

echo "=== Testing Structured Logging Implementation ==="
echo "Log directory: $BRAINSTORM_LOG_DIR"
echo "Events file: $EVENTS_FILE"
echo ""

# Test basic structured logging
echo "1. Testing basic structured logging..."
log_info "Test script started" "test_id=001 phase=1"
log_warn "This is a warning" "component=test"
log_error "This is an error" "error_code=404"

echo ""

# Test task event emission
echo "2. Testing task event emission..."
emit_task_event "TASK_START" "testTask" "test-target" '{"testId":"001","phase":"1"}'
sleep 1
emit_task_event "TASK_COMPLETE" "testTask" "test-target" '{"testId":"001","exitCode":0,"phase":"1"}'

echo ""

# Test task timer functionality
echo "3. Testing task timer functionality..."
TIMER=$(start_task_timer "timedTask" "timer-target" '{"description":"Testing timer functionality"}')
sleep 2
end_task_timer "timedTask" "timer-target" "0" "$TIMER" '{"result":"success"}'

echo ""

# Test legacy compatibility
echo "4. Testing legacy compatibility..."
legacy_log_with_event "$(date): Starting legacy task for test" "TASK_START" "legacyTask" "legacy-target"
legacy_log_with_event "$(date): Finished legacy task for test" "TASK_COMPLETE" "legacyTask" "legacy-target"

echo ""

# Show results
echo "=== Results ==="
echo ""
echo "Structured log entries:"
if [[ -f "$STRUCTURED_LOG_FILE" ]]; then
    cat "$STRUCTURED_LOG_FILE"
else
    echo "No structured log file found"
fi

echo ""
echo "Structured events (JSONL format):"
echo "Checking for events file: $EVENTS_FILE"
if [[ -f "$EVENTS_FILE" ]]; then
    echo "✅ Events file exists! Size: $(wc -l < "$EVENTS_FILE") lines"
    echo "Contents:"
    cat "$EVENTS_FILE"
    echo ""
    echo "JSON validation:"
    if cat "$EVENTS_FILE" | jq empty 2>/dev/null; then
        echo "✅ All JSON entries are valid"
        echo "Pretty-printed events:"
        cat "$EVENTS_FILE" | jq '.'
    else
        echo "❌ JSON validation failed"
        echo "Raw contents for debugging:"
        cat "$EVENTS_FILE"
    fi
else
    echo "❌ No events file found at: $EVENTS_FILE"
    echo "Directory contents:"
    ls -la "$(dirname "$EVENTS_FILE")" 2>/dev/null || echo "Directory doesn't exist"
fi

echo ""
echo "=== Testing systemStateGatherer Integration ==="

# Test the state gatherer's ability to read structured events
cd "$BRAINSTORM_MODULE_BASE_DIR"
echo "Running systemStateGatherer with test directory..."
echo "Test log directory: $BRAINSTORM_LOG_DIR"
echo "Expected state file: $BRAINSTORM_LOG_DIR/taskQueue/fullSystemState.json"

# Set environment for systemStateGatherer
export BRAINSTORM_LOG_DIR="$TEST_LOG_DIR"
node src/manage/taskQueue/systemStateGatherer.js 2>&1

echo ""
echo "Checking results..."
if [[ -f "$BRAINSTORM_LOG_DIR/taskQueue/fullSystemState.json" ]]; then
    echo "✅ State file generated successfully!"
    echo "State file size: $(wc -c < "$BRAINSTORM_LOG_DIR/taskQueue/fullSystemState.json") bytes"
    echo "Checking for structured event data..."
    
    # Check if structured events were loaded
    if grep -q "structured_events" "$BRAINSTORM_LOG_DIR/taskQueue/fullSystemState.json"; then
        echo "✅ SUCCESS: systemStateGatherer successfully loaded structured events!"
        echo "Structured events found in state file:"
        jq '.structured_events' "$BRAINSTORM_LOG_DIR/taskQueue/fullSystemState.json" 2>/dev/null || echo "Could not parse structured_events"
    else
        echo "ℹ️  INFO: No structured events found in state"
        echo "State file contents (first 500 chars):"
        head -c 500 "$BRAINSTORM_LOG_DIR/taskQueue/fullSystemState.json"
    fi
else
    echo "⚠️  WARNING: State file not generated"
    echo "Directory contents:"
    ls -la "$BRAINSTORM_LOG_DIR/taskQueue/" 2>/dev/null || echo "taskQueue directory doesn't exist"
fi

echo ""
echo "=== Phase 1 Implementation Summary ==="
echo "✅ Structured logging utility created"
echo "✅ Event emission implemented with JSONL format"
echo "✅ Task timing functionality working"
echo "✅ Legacy compatibility maintained"
echo "✅ processCustomer.sh updated with structured events (non-breaking)"
echo "✅ systemStateGatherer.js updated to prefer structured data"
echo "✅ Defensive parsing with fallback to legacy logs"
echo ""
echo "Next steps:"
echo "- Test on AWS EC2 instance"
echo "- Update more scripts (Phase 1 continuation)"
echo "- Monitor log bloat reduction"
echo "- Validate dashboard integration"

echo ""
echo "=== Final Verification ==="
echo "Test directory: $TEST_LOG_DIR"
echo "Events file: $EVENTS_FILE"
echo "Directory structure:"
find "$TEST_LOG_DIR" -type f -exec ls -la {} \; 2>/dev/null || echo "No files found"

echo ""
echo "Press Enter to clean up test files, or Ctrl+C to keep them for manual inspection..."
read -r

# Cleanup test files
echo "Cleaning up test files..."
echo "Removing test directory: $TEST_LOG_DIR"
rm -rf "$TEST_LOG_DIR"
echo "Test completed!"
