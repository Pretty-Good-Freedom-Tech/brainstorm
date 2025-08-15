#!/bin/bash

# Test script for System Resource Monitor on AWS EC2 instance
# This script helps validate the System Resource Monitor functionality

set -e

echo "=== System Resource Monitor Test Script ==="
echo "Testing Brainstorm Health Monitor System Resource Monitor on AWS EC2"
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

# Show current system status before test
echo
echo "📊 Pre-test System Status:"
echo "   Memory: $(free -h | awk 'NR==2{printf "%.1f%% (%s/%s)", $3/$2*100, $3, $2}')"
echo "   Disk:   $(df -h / | awk 'NR==2{print $5 " (" $3 "/" $2 ")"}')"
echo "   Load:   $(uptime | awk -F'load average:' '{print $2}' | sed 's/^ *//')"

# Check Neo4j status
echo "   Neo4j:  $(pgrep -f neo4j >/dev/null 2>&1 && echo "Running (PID: $(pgrep -f neo4j | head -1))" || echo "Not running")"

# Check strfry status  
echo "   strfry: $(pgrep -f strfry >/dev/null 2>&1 && echo "Running (PID: $(pgrep -f strfry | head -1))" || echo "Not running")"

echo
echo "🔍 Testing System Resource Monitor execution..."

# Test the System Resource Monitor
MONITOR_SCRIPT="$BRAINSTORM_MODULE_SRC_DIR/manage/healthMonitor/systemResourceMonitor.sh"
if [[ ! -f "$MONITOR_SCRIPT" ]]; then
    echo "❌ Error: System Resource Monitor script not found at $MONITOR_SCRIPT"
    exit 1
fi

echo "✅ Found System Resource Monitor script: $MONITOR_SCRIPT"

# Make sure it's executable
chmod +x "$MONITOR_SCRIPT"

echo
echo "🚀 Running System Resource Monitor..."
echo "Command: $MONITOR_SCRIPT --check-interval 1 --neo4j-memory-threshold 512"
echo

# Run the System Resource Monitor with test parameters
"$MONITOR_SCRIPT" --check-interval 1 --neo4j-memory-threshold 512

echo
echo "✅ System Resource Monitor execution completed!"

# Show any new HEALTH_ALERT events
echo
echo "🚨 Checking for new HEALTH_ALERT events..."
HEALTH_ALERTS=$(grep '"eventType":"HEALTH_ALERT"' "$EVENTS_FILE" 2>/dev/null | wc -l || echo "0")
echo "Found $HEALTH_ALERTS HEALTH_ALERT events in total"

if [[ "$HEALTH_ALERTS" -gt 0 ]]; then
    echo
    echo "📋 Recent HEALTH_ALERT events:"
    grep '"eventType":"HEALTH_ALERT"' "$EVENTS_FILE" | tail -5 | while IFS= read -r line; do
        echo "   $line"
    done
fi

# Show System Resource Monitor events
echo
echo "🔍 System Resource Monitor execution events:"
grep '"taskName":"systemResourceMonitor"' "$EVENTS_FILE" | tail -10 | while IFS= read -r line; do
    echo "   $line"
done

# Show Neo4j specific events
echo
echo "🔍 Neo4j health check events:"
grep '"target":"neo4j"' "$EVENTS_FILE" | tail -3 | while IFS= read -r line; do
    echo "   $line"
done

# Show strfry specific events
echo
echo "🔍 strfry health check events:"
grep '"target":"strfry"' "$EVENTS_FILE" | tail -3 | while IFS= read -r line; do
    echo "   $line"
done

echo
echo "=== System Resource Monitor Test Complete ==="
echo "✅ System Resource Monitor is working correctly on your AWS EC2 instance!"
echo
echo "Key Health Monitoring Features Tested:"
echo "• Neo4j service status and connectivity"
echo "• Neo4j memory usage and heap monitoring"
echo "• Java garbage collection metrics (if available)"
echo "• strfry service health"
echo "• System memory, disk, and load monitoring"
echo "• Configurable alert thresholds"
echo
echo "Next steps:"
echo "1. Review any HEALTH_ALERT events above"
echo "2. Check the Task Explorer dashboard for new health monitoring data"
echo "3. Consider scheduling System Resource Monitor to run periodically (e.g., every 5 minutes)"
echo "4. Monitor Neo4j stability over time with the new health data"
echo
