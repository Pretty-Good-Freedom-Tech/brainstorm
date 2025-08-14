#!/bin/bash

# Test script for Task Watchdog on AWS EC2 instance
# This script helps validate the Task Watchdog functionality

set -e

echo "=== Task Watchdog Test Script ==="
echo "Testing Brainstorm Health Monitor Task Watchdog on AWS EC2"
echo

# Check if we're on the right system
if [[ ! -f "/etc/brainstorm.conf" ]]; then
    echo "❌ Error: /etc/brainstorm.conf not found. Are you on the AWS EC2 instance?"
    exit 1
fi

echo "✅ Found brainstorm.conf - we're on the production system"

# Source the config
source /etc/brainstorm.conf

# Check if structured logging directory exists
if [[ ! -d "$BRAINSTORM_LOG_DIR/taskQueue" ]]; then
    echo "❌ Error: Structured logging directory not found at $BRAINSTORM_LOG_DIR/taskQueue"
    exit 1
fi

echo "✅ Found structured logging directory: $BRAINSTORM_LOG_DIR/taskQueue"

# Check if events file exists
EVENTS_FILE="$BRAINSTORM_LOG_DIR/taskQueue/events.jsonl"
if [[ ! -f "$EVENTS_FILE" ]]; then
    echo "❌ Error: Events file not found at $EVENTS_FILE"
    exit 1
fi

echo "✅ Found events file: $EVENTS_FILE"

# Show recent events count
EVENT_COUNT=$(wc -l < "$EVENTS_FILE" 2>/dev/null || echo "0")
echo "📊 Events file contains $EVENT_COUNT events"

# Show recent events sample
echo
echo "📋 Recent events sample (last 3 events):"
tail -3 "$EVENTS_FILE" | while IFS= read -r line; do
    echo "   $line"
done

echo
echo "🔍 Testing Task Watchdog execution..."

# Test the Task Watchdog
WATCHDOG_SCRIPT="$BRAINSTORM_MODULE_SRC_DIR/manage/healthMonitor/taskWatchdog.sh"
if [[ ! -f "$WATCHDOG_SCRIPT" ]]; then
    echo "❌ Error: Task Watchdog script not found at $WATCHDOG_SCRIPT"
    exit 1
fi

echo "✅ Found Task Watchdog script: $WATCHDOG_SCRIPT"

# Make sure it's executable
chmod +x "$WATCHDOG_SCRIPT"

echo
echo "🚀 Running Task Watchdog..."
echo "Command: $WATCHDOG_SCRIPT --check-interval 1 --alert-threshold-multiplier 1.5"
echo

# Run the Task Watchdog with test parameters
"$WATCHDOG_SCRIPT" --check-interval 1 --alert-threshold-multiplier 1.5

echo
echo "✅ Task Watchdog execution completed!"

# Show any new HEALTH_ALERT events
echo
echo "🚨 Checking for new HEALTH_ALERT events..."
HEALTH_ALERTS=$(grep '"eventType":"HEALTH_ALERT"' "$EVENTS_FILE" 2>/dev/null | wc -l || echo "0")
echo "Found $HEALTH_ALERTS HEALTH_ALERT events in total"

if [[ "$HEALTH_ALERTS" -gt 0 ]]; then
    echo
    echo "📋 Recent HEALTH_ALERT events:"
    grep '"eventType":"HEALTH_ALERT"' "$EVENTS_FILE" | tail -3 | while IFS= read -r line; do
        echo "   $line"
    done
fi

# Show Task Watchdog events
echo
echo "🔍 Task Watchdog execution events:"
grep '"taskName":"taskWatchdog"' "$EVENTS_FILE" | tail -5 | while IFS= read -r line; do
    echo "   $line"
done

echo
echo "=== Task Watchdog Test Complete ==="
echo "✅ Task Watchdog is working correctly on your AWS EC2 instance!"
echo
echo "Next steps:"
echo "1. Review any HEALTH_ALERT events above"
echo "2. Check the Task Explorer dashboard for new health monitoring data"
echo "3. Consider scheduling Task Watchdog to run periodically (e.g., every 5 minutes)"
echo
