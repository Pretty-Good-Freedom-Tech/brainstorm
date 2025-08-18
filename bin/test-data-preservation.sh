#!/bin/bash

# Test Data Preservation System
# Manually triggers the critical data preservation process for testing

set -e

# Find project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Set environment variables
export BRAINSTORM_MODULE_BASE_DIR="$PROJECT_ROOT"
export BRAINSTORM_LOG_DIR="${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}"

echo "Testing critical data preservation system..."
echo "Project root: $PROJECT_ROOT"
echo "Log directory: $BRAINSTORM_LOG_DIR"

# Check if events file exists
EVENTS_FILE="${BRAINSTORM_LOG_DIR}/taskQueue/events.jsonl"
if [[ ! -f "$EVENTS_FILE" ]]; then
    echo "❌ Events file not found: $EVENTS_FILE"
    echo "The preservation system requires existing events to preserve."
    exit 1
fi

echo "✅ Events file found: $EVENTS_FILE"
echo "Events file size: $(wc -l < "$EVENTS_FILE") lines"

# Run the preservation script
PRESERVER_SCRIPT="${PROJECT_ROOT}/src/utils/criticalDataPreserver.sh"
if [[ ! -f "$PRESERVER_SCRIPT" ]]; then
    echo "❌ Preservation script not found: $PRESERVER_SCRIPT"
    exit 1
fi

echo "✅ Preservation script found: $PRESERVER_SCRIPT"
echo ""
echo "Running data preservation..."

# Execute preservation
bash "$PRESERVER_SCRIPT"

# Check results
PRESERVED_DIR="${BRAINSTORM_LOG_DIR}/preserved"
echo ""
echo "Checking preservation results..."

if [[ -d "$PRESERVED_DIR" ]]; then
    echo "✅ Preserved directory created: $PRESERVED_DIR"
    
    # List preserved files
    echo ""
    echo "Preserved files:"
    ls -la "$PRESERVED_DIR"
    
    # Show summary if available
    SUMMARY_FILE="${PRESERVED_DIR}/preservation_summary.json"
    if [[ -f "$SUMMARY_FILE" ]]; then
        echo ""
        echo "Preservation summary:"
        cat "$SUMMARY_FILE" | jq '.'
    fi
else
    echo "❌ Preserved directory not created"
    exit 1
fi

echo ""
echo "✅ Data preservation test completed successfully"
