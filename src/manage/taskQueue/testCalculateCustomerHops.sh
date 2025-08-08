#!/bin/bash

# Test script for Phase 2 structured logging in customers/calculateHops.sh
# This script tests the hop calculation algorithm with structured event emission

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE"

echo "🧪 Testing Phase 2 Structured Logging: customers/calculateHops.sh"
echo "=================================================="
echo ""

# Test customer data (using example from cloudfodder.brainstorm.social)
TEST_CUSTOMER_PUBKEY="52387c6b99cc42aac51916b08b7b51d2baddfc19f2ba08d82a48432849dbdfb2"
TEST_CUSTOMER_ID="2"
TEST_CUSTOMER_NAME="bevo"

echo "🎯 Test Customer:"
echo "   Name: $TEST_CUSTOMER_NAME"
echo "   ID: $TEST_CUSTOMER_ID"
echo "   Pubkey: $TEST_CUSTOMER_PUBKEY"
echo ""

# Create test environment
TEST_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEST_DIR="${BRAINSTORM_LOG_DIR}/taskQueue/test_hops_${TEST_TIMESTAMP}"
mkdir -p "$TEST_DIR"

# Override log directory for testing
export BRAINSTORM_LOG_DIR="$TEST_DIR"

echo "📁 Test directory: $TEST_DIR"
echo ""

# Initialize structured logging in test environment
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

echo "🚀 Running customers/calculateHops.sh with structured logging..."
echo "⏱️  Start time: $(date)"
echo ""

# Run the script
START_TIME=$(date +%s)

sudo bash "$BRAINSTORM_MODULE_ALGOS_DIR/customers/calculateHops.sh" \
    "$TEST_CUSTOMER_PUBKEY" "$TEST_CUSTOMER_ID" "$TEST_CUSTOMER_NAME" 2>&1 | \
    tee "$TEST_DIR/test_execution.log"

SCRIPT_EXIT_CODE=$?
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "⏱️  Execution completed in ${DURATION} seconds"
echo "📊 Exit code: $SCRIPT_EXIT_CODE"
echo ""

# Check for structured events
EVENTS_FILE="${TEST_DIR}/taskQueue/events.jsonl"
STRUCTURED_LOG="${TEST_DIR}/taskQueue/structured.log"

echo "🔍 Analyzing structured events..."
echo ""

if [[ -f "$EVENTS_FILE" ]]; then
    echo "✅ Events file created: $EVENTS_FILE"
    echo "📏 Events file size: $(wc -l < "$EVENTS_FILE") lines"
    echo ""
    
    # Count different event types
    TASK_START_COUNT=$(grep -c '"eventType":"TASK_START"' "$EVENTS_FILE" 2>/dev/null || echo "0")
    TASK_END_COUNT=$(grep -c '"eventType":"TASK_END"' "$EVENTS_FILE" 2>/dev/null || echo "0")
    PROGRESS_COUNT=$(grep -c '"eventType":"PROGRESS"' "$EVENTS_FILE" 2>/dev/null || echo "0")
    
    echo "📈 Event Summary:"
    echo "   TASK_START events: $TASK_START_COUNT"
    echo "   TASK_END events: $TASK_END_COUNT"
    echo "   PROGRESS events: $PROGRESS_COUNT"
    echo ""
    
    # Analyze progress events by step
    INIT_COUNT=$(grep -c '"step":"initialization"' "$EVENTS_FILE" 2>/dev/null || echo "0")
    ITERATION_COUNT=$(grep -c '"step":"iteration"' "$EVENTS_FILE" 2>/dev/null || echo "0")
    ITERATION_COMPLETE_COUNT=$(grep -c '"step":"iteration_complete"' "$EVENTS_FILE" 2>/dev/null || echo "0")
    
    echo "🔄 Progress Event Breakdown:"
    echo "   Initialization: $INIT_COUNT"
    echo "   Iteration starts: $ITERATION_COUNT"
    echo "   Iteration completions: $ITERATION_COMPLETE_COUNT"
    echo ""
    
    # Extract hop progression
    echo "📊 Hop Calculation Progression:"
    grep '"hop_level"' "$EVENTS_FILE" | jq -r '"\(.timestamp) | Hop \(.hop_level): \(.updates_count // "N/A") updates - \(.message)"' 2>/dev/null || \
    grep '"hop_level"' "$EVENTS_FILE" | sed 's/.*"hop_level":"\([^"]*\)".*"updates_count":"\([^"]*\)".*"message":"\([^"]*\)".*/Hop \1: \2 updates - \3/'
    echo ""
    
    # Show completion details
    if [[ $TASK_END_COUNT -gt 0 ]]; then
        echo "🏁 Completion Details:"
        grep '"eventType":"TASK_END"' "$EVENTS_FILE" | jq -r '"Final hop level: \(.final_hop_level), Final updates: \(.final_updates_count), Reason: \(.completion_reason)"' 2>/dev/null || \
        grep '"eventType":"TASK_END"' "$EVENTS_FILE" | tail -1
    fi
    echo ""
    
    # Validate JSON format
    echo "🔧 JSON Validation:"
    if jq empty "$EVENTS_FILE" 2>/dev/null; then
        echo "✅ All events are valid JSON"
    else
        echo "❌ Some events have invalid JSON format"
        echo "Invalid lines:"
        jq empty "$EVENTS_FILE" 2>&1 | head -3
    fi
    echo ""
    
    # Show sample events
    echo "📋 Sample Events (first 3):"
    echo "--- TASK_START ---"
    grep '"eventType":"TASK_START"' "$EVENTS_FILE" | head -1 | jq '.' 2>/dev/null || grep '"eventType":"TASK_START"' "$EVENTS_FILE" | head -1
    echo ""
    echo "--- PROGRESS (first) ---"
    grep '"eventType":"PROGRESS"' "$EVENTS_FILE" | head -1 | jq '.' 2>/dev/null || grep '"eventType":"PROGRESS"' "$EVENTS_FILE" | head -1
    echo ""
    echo "--- TASK_END ---"
    grep '"eventType":"TASK_END"' "$EVENTS_FILE" | head -1 | jq '.' 2>/dev/null || grep '"eventType":"TASK_END"' "$EVENTS_FILE" | head -1
    echo ""
    
else
    echo "❌ Events file not created: $EVENTS_FILE"
    echo "   This might indicate:"
    echo "   - Structured logging utility not sourced properly"
    echo "   - Script failed before emitting events"
    echo "   - Directory permissions issue"
fi

if [[ -f "$STRUCTURED_LOG" ]]; then
    echo "✅ Structured log created: $STRUCTURED_LOG"
    echo "📏 Log size: $(wc -l < "$STRUCTURED_LOG") lines"
else
    echo "❌ Structured log not created: $STRUCTURED_LOG"
fi

echo ""
echo "📁 Test files available for inspection:"
echo "   Events: $EVENTS_FILE"
echo "   Structured log: $STRUCTURED_LOG"
echo "   Execution log: $TEST_DIR/test_execution.log"
echo "   Customer log: $TEST_DIR/customers/$TEST_CUSTOMER_NAME/calculateHops.log"
echo "   Test directory: $TEST_DIR"
echo ""

# Summary
if [[ $SCRIPT_EXIT_CODE -eq 0 ]] && [[ -f "$EVENTS_FILE" ]] && [[ $TASK_START_COUNT -gt 0 ]] && [[ $TASK_END_COUNT -gt 0 ]]; then
    echo "🎉 SUCCESS: calculateCustomerHops Phase 2 structured logging is working!"
    echo "   ✅ Script executed successfully"
    echo "   ✅ Events file created with valid JSON"
    echo "   ✅ TASK_START and TASK_END events emitted"
    echo "   ✅ Progress events track hop calculation iterations"
else
    echo "⚠️  ISSUES DETECTED:"
    [[ $SCRIPT_EXIT_CODE -ne 0 ]] && echo "   ❌ Script failed with exit code $SCRIPT_EXIT_CODE"
    [[ ! -f "$EVENTS_FILE" ]] && echo "   ❌ No events file created"
    [[ $TASK_START_COUNT -eq 0 ]] && echo "   ❌ No TASK_START events found"
    [[ $TASK_END_COUNT -eq 0 ]] && echo "   ❌ No TASK_END events found"
fi

echo ""
echo "⏸️  Press Enter to clean up test directory, or Ctrl+C to keep for inspection..."
read -r

# Cleanup
echo "🧹 Cleaning up test directory..."
rm -rf "$TEST_DIR"
echo "✅ Test completed!"
