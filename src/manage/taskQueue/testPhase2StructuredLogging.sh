#!/bin/bash

# Test script for Phase 2 structured logging implementation
# Tests updateAllScoresForSingleCustomer.sh structured events

CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE"

# Create test environment
TEST_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
TEST_DIR="${BRAINSTORM_LOG_DIR}/taskQueue/test_phase2_${TEST_TIMESTAMP}"
mkdir -p "$TEST_DIR"

# Override log directory for testing
export BRAINSTORM_LOG_DIR="$TEST_DIR"

echo "🧪 Testing Phase 2 Structured Logging Implementation"
echo "📁 Test directory: $TEST_DIR"
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

# Initialize structured logging in test environment
source "$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"

echo "📊 Running updateAllScoresForSingleCustomer.sh with structured logging..."
echo ""

# Run the script (this will likely fail due to missing data, but we want to test event emission)
START_TIME=$(date +%s)

# Note: This will likely fail, but we want to capture the structured events
sudo bash "$BRAINSTORM_MODULE_ALGOS_DIR/customers/updateAllScoresForSingleCustomer.sh" \
    "$TEST_CUSTOMER_PUBKEY" "$TEST_CUSTOMER_ID" "$TEST_CUSTOMER_NAME" 2>&1 | \
    tee "$TEST_DIR/test_execution.log"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo ""
echo "⏱️  Execution completed in ${DURATION} seconds"
echo ""

# Check for structured events
EVENTS_FILE="${TEST_DIR}/taskQueue/events.jsonl"
STRUCTURED_LOG="${TEST_DIR}/taskQueue/structured.log"

echo "🔍 Analyzing structured events..."
echo ""

if [[ -f "$EVENTS_FILE" ]]; then
    echo "✅ Events file created: $EVENTS_FILE"
    
    # Count different event types
    TASK_START_COUNT=$(grep -c '"eventType":"TASK_START"' "$EVENTS_FILE" 2>/dev/null || echo "0")
    TASK_END_COUNT=$(grep -c '"eventType":"TASK_END"' "$EVENTS_FILE" 2>/dev/null || echo "0")
    CHILD_START_COUNT=$(grep -c '"eventType":"CHILD_TASK_START"' "$EVENTS_FILE" 2>/dev/null || echo "0")
    CHILD_END_COUNT=$(grep -c '"eventType":"CHILD_TASK_END"' "$EVENTS_FILE" 2>/dev/null || echo "0")
    CHILD_ERROR_COUNT=$(grep -c '"eventType":"CHILD_TASK_ERROR"' "$EVENTS_FILE" 2>/dev/null || echo "0")
    
    echo "📈 Event Summary:"
    echo "   TASK_START events: $TASK_START_COUNT"
    echo "   TASK_END events: $TASK_END_COUNT"
    echo "   CHILD_TASK_START events: $CHILD_START_COUNT"
    echo "   CHILD_TASK_END events: $CHILD_END_COUNT"
    echo "   CHILD_TASK_ERROR events: $CHILD_ERROR_COUNT"
    echo ""
    
    # Show sample events
    echo "📋 Sample Events:"
    echo "--- First 3 events ---"
    head -3 "$EVENTS_FILE" | jq '.' 2>/dev/null || head -3 "$EVENTS_FILE"
    echo ""
    
    # Validate JSON format
    echo "🔧 JSON Validation:"
    if jq empty "$EVENTS_FILE" 2>/dev/null; then
        echo "✅ All events are valid JSON"
    else
        echo "❌ Some events have invalid JSON format"
        echo "Invalid lines:"
        jq empty "$EVENTS_FILE" 2>&1 | head -5
    fi
    echo ""
    
    # Check for expected task names
    echo "🎯 Task Name Validation:"
    if grep -q '"taskName":"updateAllScoresForSingleCustomer"' "$EVENTS_FILE"; then
        echo "✅ Main task events found"
    else
        echo "❌ Main task events missing"
    fi
    
    EXPECTED_CHILD_TASKS=("calculateCustomerHops" "calculateCustomerPageRank" "calculateCustomerGrapeRank" "processCustomerFollowsMutesReports" "exportCustomerKind30382")
    
    for task in "${EXPECTED_CHILD_TASKS[@]}"; do
        if grep -q "\"taskName\":\"$task\"" "$EVENTS_FILE"; then
            echo "✅ Child task '$task' events found"
        else
            echo "❌ Child task '$task' events missing"
        fi
    done
    
else
    echo "❌ Events file not created: $EVENTS_FILE"
fi

echo ""

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
echo "   Test directory: $TEST_DIR"
echo ""

# Pause for manual inspection
echo "⏸️  Press Enter to clean up test directory, or Ctrl+C to keep for inspection..."
read -r

# Cleanup
echo "🧹 Cleaning up test directory..."
rm -rf "$TEST_DIR"
echo "✅ Test completed!"
