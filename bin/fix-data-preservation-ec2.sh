#!/bin/bash

# Fix and Test Data Preservation System on AWS EC2
# Run this script on your AWS EC2 instance to diagnose and fix preservation issues

set -e

echo "🔧 Brainstorm Data Preservation System Diagnostic & Fix"
echo "=================================================="

# Check current environment
echo ""
echo "📋 Environment Check:"
echo "BRAINSTORM_MODULE_BASE_DIR: ${BRAINSTORM_MODULE_BASE_DIR:-'NOT SET'}"
echo "BRAINSTORM_LOG_DIR: ${BRAINSTORM_LOG_DIR:-'NOT SET (will use /var/log/brainstorm)'}"
echo "Current user: $(whoami)"
echo "Current directory: $(pwd)"

# Find Brainstorm installation
BRAINSTORM_ROOT=""
if [[ -n "$BRAINSTORM_MODULE_BASE_DIR" && -d "$BRAINSTORM_MODULE_BASE_DIR" ]]; then
    BRAINSTORM_ROOT="$BRAINSTORM_MODULE_BASE_DIR"
    echo "✅ Using BRAINSTORM_MODULE_BASE_DIR: $BRAINSTORM_ROOT"
elif [[ -f "/opt/brainstorm/package.json" ]]; then
    BRAINSTORM_ROOT="/opt/brainstorm"
    echo "✅ Found Brainstorm at: $BRAINSTORM_ROOT"
elif [[ -f "/home/ubuntu/brainstorm/package.json" ]]; then
    BRAINSTORM_ROOT="/home/ubuntu/brainstorm"
    echo "✅ Found Brainstorm at: $BRAINSTORM_ROOT"
elif [[ -f "$(pwd)/package.json" ]]; then
    BRAINSTORM_ROOT="$(pwd)"
    echo "✅ Found Brainstorm at: $BRAINSTORM_ROOT"
else
    echo "❌ Cannot locate Brainstorm installation"
    echo "Please run this script from the Brainstorm root directory or set BRAINSTORM_MODULE_BASE_DIR"
    exit 1
fi

# Set environment for this session
export BRAINSTORM_MODULE_BASE_DIR="$BRAINSTORM_ROOT"
export BRAINSTORM_LOG_DIR="${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}"

echo ""
echo "📁 File System Check:"
echo "Brainstorm root: $BRAINSTORM_ROOT"
echo "Log directory: $BRAINSTORM_LOG_DIR"

# Check critical files
EVENTS_FILE="${BRAINSTORM_LOG_DIR}/taskQueue/events.jsonl"
PRESERVER_SCRIPT="${BRAINSTORM_ROOT}/src/utils/criticalDataPreserver.sh"
STRUCTURED_LOGGING="${BRAINSTORM_ROOT}/src/utils/structuredLogging.sh"

echo ""
echo "🔍 Critical Files Check:"
if [[ -f "$EVENTS_FILE" ]]; then
    EVENTS_SIZE=$(wc -l < "$EVENTS_FILE" 2>/dev/null || echo "0")
    echo "✅ Events file: $EVENTS_FILE ($EVENTS_SIZE lines)"
else
    echo "❌ Events file missing: $EVENTS_FILE"
fi

if [[ -f "$PRESERVER_SCRIPT" ]]; then
    echo "✅ Preservation script: $PRESERVER_SCRIPT"
else
    echo "❌ Preservation script missing: $PRESERVER_SCRIPT"
fi

if [[ -f "$STRUCTURED_LOGGING" ]]; then
    echo "✅ Structured logging: $STRUCTURED_LOGGING"
else
    echo "❌ Structured logging missing: $STRUCTURED_LOGGING"
fi

# Check if preserved directory exists
PRESERVED_DIR="${BRAINSTORM_LOG_DIR}/preserved"
echo ""
echo "📂 Preserved Directory Status:"
if [[ -d "$PRESERVED_DIR" ]]; then
    echo "✅ Preserved directory exists: $PRESERVED_DIR"
    echo "Contents:"
    ls -la "$PRESERVED_DIR" 2>/dev/null || echo "  (empty or permission denied)"
else
    echo "❌ Preserved directory missing: $PRESERVED_DIR"
fi

# Test manual preservation
echo ""
echo "🧪 Testing Manual Data Preservation:"
if [[ -f "$PRESERVER_SCRIPT" && -f "$EVENTS_FILE" ]]; then
    echo "Running preservation script..."
    
    # Make sure script is executable
    chmod +x "$PRESERVER_SCRIPT" 2>/dev/null || true
    
    # Run preservation
    if bash "$PRESERVER_SCRIPT"; then
        echo "✅ Manual preservation completed successfully"
        
        # Check results
        if [[ -d "$PRESERVED_DIR" ]]; then
            echo "✅ Preserved directory created"
            echo ""
            echo "📊 Preservation Results:"
            ls -la "$PRESERVED_DIR"
            
            # Show summary if available
            SUMMARY_FILE="${PRESERVED_DIR}/preservation_summary.json"
            if [[ -f "$SUMMARY_FILE" ]]; then
                echo ""
                echo "📋 Preservation Summary:"
                cat "$SUMMARY_FILE" | jq '.' 2>/dev/null || cat "$SUMMARY_FILE"
            fi
        else
            echo "⚠️ Preservation script ran but directory not created"
        fi
    else
        echo "❌ Manual preservation failed"
    fi
else
    echo "⚠️ Cannot test - missing required files"
fi

# Check log rotation configuration
echo ""
echo "🔄 Log Rotation Analysis:"
if [[ -f "$EVENTS_FILE" ]]; then
    CURRENT_SIZE=$(wc -l < "$EVENTS_FILE")
    MAX_SIZE=$(grep "BRAINSTORM_EVENTS_MAX_SIZE" "$STRUCTURED_LOGGING" 2>/dev/null | head -1 | grep -o '[0-9]\+' || echo "10000")
    echo "Current events file size: $CURRENT_SIZE lines"
    echo "Rotation threshold: $MAX_SIZE lines"
    
    if [[ "$CURRENT_SIZE" -gt "$MAX_SIZE" ]]; then
        echo "⚠️ Events file exceeds rotation threshold - rotation should have occurred"
    else
        echo "ℹ️ Events file below rotation threshold"
    fi
fi

# Recommendations
echo ""
echo "💡 Recommendations:"
if [[ ! -d "$PRESERVED_DIR" ]]; then
    echo "1. The preserved directory was not created during log rotation"
    echo "2. This indicates the preservation script path resolution was broken"
    echo "3. The fix has been applied to structuredLogging.sh"
    echo "4. Next log rotation should create the preserved directory"
fi

echo "5. To force preservation now, run: bash $PRESERVER_SCRIPT"
echo "6. To test log rotation, you can temporarily lower BRAINSTORM_EVENTS_MAX_SIZE"

echo ""
echo "🎯 Next Steps:"
echo "1. Deploy the updated structuredLogging.sh to your EC2 instance"
echo "2. The preservation system will work automatically on the next log rotation"
echo "3. Monitor the structured.log for preservation messages"

echo ""
echo "✅ Diagnostic completed"
