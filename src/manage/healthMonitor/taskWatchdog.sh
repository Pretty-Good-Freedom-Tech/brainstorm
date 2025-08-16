#!/bin/bash

# Brainstorm Health Monitor - Task Watchdog
# Monitors for stuck, failed, and orphaned tasks using structured logging data
#
# This component analyzes events.jsonl to detect:
# - Tasks running longer than expected duration
# - Orphaned child processes (parent died but child still running)
# - Tasks that started but never completed (missing TASK_END/TASK_ERROR)
# - Resource-related task failures
#
# Usage: ./taskWatchdog.sh [--check-interval MINUTES] [--alert-threshold-multiplier X]

# DEBUG: Create debug log file
DEBUG_LOG="/tmp/taskWatchdog_debug.log"
exec 19>"$DEBUG_LOG"

# DEBUG: Function to log both to console and file
debug_log() {
    local message="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo "$message" >&2
    echo "$message" >&19
}

debug_log "=== TASKWATCHDOG DEBUG START ==="
debug_log "Script called with arguments: $*"
debug_log "Current working directory: $(pwd)"
debug_log "Current user: $(whoami)"
debug_log "Process ID: $$"

set -e
set -o pipefail

debug_log "Bash options set successfully"

# Configuration
CONFIG_FILE="/etc/brainstorm.conf"
debug_log "Checking for config file: $CONFIG_FILE"
if [[ -f "$CONFIG_FILE" ]]; then
    debug_log "Config file found, sourcing it"
    source "$CONFIG_FILE"
    debug_log "Config file sourced successfully"
else
    debug_log "Config file not found"
fi

# Determine base directory for development vs production
debug_log "BRAINSTORM_MODULE_BASE_DIR before: '$BRAINSTORM_MODULE_BASE_DIR'"
if [[ -z "$BRAINSTORM_MODULE_BASE_DIR" ]]; then
    debug_log "BRAINSTORM_MODULE_BASE_DIR not set, determining from script location"
    # Development mode - determine from script location
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    debug_log "SCRIPT_DIR: $SCRIPT_DIR"
    BRAINSTORM_MODULE_BASE_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
    debug_log "Calculated BRAINSTORM_MODULE_BASE_DIR: $BRAINSTORM_MODULE_BASE_DIR"
else
    debug_log "BRAINSTORM_MODULE_BASE_DIR already set: $BRAINSTORM_MODULE_BASE_DIR"
fi

# Source structured logging utilities
STRUCTURED_LOGGING_PATH="$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"
debug_log "Looking for structured logging at: $STRUCTURED_LOGGING_PATH"
if [[ ! -f "$STRUCTURED_LOGGING_PATH" ]]; then
    debug_log "ERROR: Cannot find structured logging utilities at $STRUCTURED_LOGGING_PATH"
    debug_log "BRAINSTORM_MODULE_BASE_DIR: $BRAINSTORM_MODULE_BASE_DIR"
    debug_log "SCRIPT_DIR: $SCRIPT_DIR"
    echo "Error: Cannot find structured logging utilities at $STRUCTURED_LOGGING_PATH" >&2
    echo "BRAINSTORM_MODULE_BASE_DIR: $BRAINSTORM_MODULE_BASE_DIR" >&2
    echo "SCRIPT_DIR: $SCRIPT_DIR" >&2
    exit 1
fi
debug_log "Structured logging file found, sourcing it"
source "$STRUCTURED_LOGGING_PATH"
debug_log "Structured logging sourced successfully"

# Default configuration
debug_log "Setting default configuration values"
CHECK_INTERVAL_MINUTES=${1:-5}  # How often to run checks
ALERT_THRESHOLD_MULTIPLIER=${2:-2.0}  # Alert when task exceeds expected duration by this factor
MAX_ORPHAN_AGE_MINUTES=30  # Consider processes orphaned after parent missing this long
debug_log "Default config: CHECK_INTERVAL_MINUTES=$CHECK_INTERVAL_MINUTES, ALERT_THRESHOLD_MULTIPLIER=$ALERT_THRESHOLD_MULTIPLIER, MAX_ORPHAN_AGE_MINUTES=$MAX_ORPHAN_AGE_MINUTES"

# Parse command line arguments
debug_log "Parsing command line arguments: $*"
while [[ $# -gt 0 ]]; do
    debug_log "Processing argument: $1"
    case $1 in
        --check-interval)
            CHECK_INTERVAL_MINUTES="$2"
            debug_log "Set CHECK_INTERVAL_MINUTES to $2"
            shift 2
            ;;
        --alert-threshold-multiplier)
            ALERT_THRESHOLD_MULTIPLIER="$2"
            debug_log "Set ALERT_THRESHOLD_MULTIPLIER to $2"
            shift 2
            ;;
        --help)
            debug_log "Help requested, exiting"
            echo "Usage: $0 [--check-interval MINUTES] [--alert-threshold-multiplier X]"
            echo "  --check-interval: How often to run checks (default: 5 minutes)"
            echo "  --alert-threshold-multiplier: Alert when task exceeds expected duration by this factor (default: 2.0)"
            exit 0
            ;;
        *)
            debug_log "Unknown option: $1 (ignoring)"
            echo "Warning: Unknown option '$1' ignored"
            shift
            ;;
    esac
done
debug_log "Command line parsing completed"

# Emit structured event for watchdog start
debug_log "About to emit TASK_START event"
debug_log "Calling emit_task_event function..."
emit_task_event "TASK_START" "taskWatchdog" "system" '{
    "message": "Starting Brainstorm Health Monitor Task Watchdog",
    "checkIntervalMinutes": '$CHECK_INTERVAL_MINUTES',
    "alertThresholdMultiplier": '$ALERT_THRESHOLD_MULTIPLIER',
    "maxOrphanAgeMinutes": '$MAX_ORPHAN_AGE_MINUTES',
    "component": "healthMonitor",
    "watchdogType": "taskMonitor"
}'
debug_log "TASK_START event emitted successfully"

# Function to get current timestamp in seconds since epoch
get_current_epoch() {
    debug_log "Getting current epoch timestamp"
    local epoch=$(date +%s)
    debug_log "Current epoch: $epoch"
    echo "$epoch"
}

# Function to convert ISO timestamp to epoch seconds
iso_to_epoch() {
    local iso_timestamp="$1"
    debug_log "Converting ISO timestamp to epoch: $iso_timestamp"
    local result=$(date -d "$iso_timestamp" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S%z" "$iso_timestamp" +%s 2>/dev/null || echo "0")
    debug_log "Converted result: $result"
    echo "$result"
}

# Function to check if a process is still running
is_process_alive() {
    local pid="$1"
    ps -p "$pid" >/dev/null 2>&1
}

# Function to analyze events and detect task anomalies
analyze_task_health() {
    local events_file="$EVENTS_FILE"
    local current_epoch=$(get_current_epoch)
    local alerts_generated=0
    
    if [[ ! -f "$events_file" ]]; then
        emit_task_event "PROGRESS" "taskWatchdog" "system" '{
            "message": "No events file found, skipping analysis",
            "eventsFile": "'$events_file'",
            "status": "no_data"
        }'
        return 0
    fi
    
    emit_task_event "PROGRESS" "taskWatchdog" "system" '{
        "message": "Starting task health analysis",
        "eventsFile": "'$events_file'",
        "currentTime": "'$(get_iso_timestamp)'"
    }'
    
    # Create temporary files for analysis
    local temp_dir=$(mktemp -d)
    local running_tasks="$temp_dir/running_tasks.txt"
    local completed_tasks="$temp_dir/completed_tasks.txt"
    local failed_tasks="$temp_dir/failed_tasks.txt"
    
    # Extract running tasks (TASK_START without corresponding TASK_END/TASK_ERROR)
    # This is a simplified analysis - in production, we'd use more sophisticated parsing
    
    # Find all TASK_START events
    grep '"eventType":"TASK_START"' "$events_file" | while IFS= read -r line; do
        # Extract task info using basic parsing (would use jq in production)
        local task_name=$(echo "$line" | sed -n 's/.*"taskName":"\([^"]*\)".*/\1/p')
        local pid=$(echo "$line" | sed -n 's/.*"pid":\([0-9]*\).*/\1/p')
        local timestamp=$(echo "$line" | sed -n 's/.*"timestamp":"\([^"]*\)".*/\1/p')
        local expected_duration=$(echo "$line" | sed -n 's/.*"expectedDurationMinutes":\([0-9]*\).*/\1/p')
        
        if [[ -n "$task_name" && -n "$pid" && -n "$timestamp" ]]; then
            # Check if this task has a corresponding END or ERROR event
            local has_completion=$(grep -c "\"eventType\":\"TASK_\(END\|ERROR\)\".*\"taskName\":\"$task_name\".*\"pid\":$pid" "$events_file" 2>/dev/null | tr -d '\n' || echo "0")
            
            if [[ "$has_completion" -eq 0 ]]; then
                # Task is potentially still running
                local start_epoch=$(iso_to_epoch "$timestamp")
                local duration_minutes=$(( (current_epoch - start_epoch) / 60 ))
                
                echo "$task_name|$pid|$timestamp|$duration_minutes|$expected_duration" >> "$running_tasks"
                
                # Check for stuck tasks (running longer than expected)
                if [[ -n "$expected_duration" && "$expected_duration" -gt 0 ]]; then
                    local alert_threshold=$(echo "$expected_duration * $ALERT_THRESHOLD_MULTIPLIER" | bc -l 2>/dev/null || echo "$expected_duration")
                    
                    if [[ "$duration_minutes" -gt "${alert_threshold%.*}" ]]; then
                        # Task is running longer than expected - check if process is still alive
                        if is_process_alive "$pid"; then
                            emit_task_event "HEALTH_ALERT" "taskWatchdog" "system" '{
                                "alertType": "STUCK_TASK",
                                "taskName": "'$task_name'",
                                "pid": '$pid',
                                "durationMinutes": '$duration_minutes',
                                "expectedDurationMinutes": '$expected_duration',
                                "alertThreshold": '$alert_threshold',
                                "message": "Task '$task_name' has been running for '$duration_minutes' minutes, exceeding expected duration of '$expected_duration' minutes",
                                "severity": "WARNING",
                                "processStatus": "alive"
                            }'
                            alerts_generated=$((alerts_generated + 1))
                        else
                            emit_task_event "HEALTH_ALERT" "taskWatchdog" "system" '{
                                "alertType": "DEAD_TASK_NO_COMPLETION",
                                "taskName": "'$task_name'",
                                "pid": '$pid',
                                "durationMinutes": '$duration_minutes',
                                "expectedDurationMinutes": '$expected_duration',
                                "message": "Task '$task_name' process died without emitting completion event",
                                "severity": "ERROR",
                                "processStatus": "dead"
                            }'
                            alerts_generated=$((alerts_generated + 1))
                        fi
                    fi
                fi
                
                # Check for orphaned processes (parent task died)
                local parent_task=$(echo "$line" | sed -n 's/.*"parentTask":"\([^"]*\)".*/\1/p')
                if [[ -n "$parent_task" ]]; then
                    # Check if parent task is still running or completed recently
                    local parent_active=$(grep -c "\"eventType\":\"TASK_START\".*\"taskName\":\"$parent_task\"" "$events_file" | tail -1)
                    local parent_completed=$(grep -c "\"eventType\":\"TASK_\(END\|ERROR\)\".*\"taskName\":\"$parent_task\"" "$events_file" | tail -1)
                    
                    if [[ "$parent_completed" -gt "$parent_active" ]] && [[ "$duration_minutes" -gt "$MAX_ORPHAN_AGE_MINUTES" ]]; then
                        if is_process_alive "$pid"; then
                            emit_task_event "HEALTH_ALERT" "taskWatchdog" "system" '{
                                "alertType": "ORPHANED_TASK",
                                "taskName": "'$task_name'",
                                "parentTask": "'$parent_task'",
                                "pid": '$pid',
                                "durationMinutes": '$duration_minutes',
                                "maxOrphanAgeMinutes": '$MAX_ORPHAN_AGE_MINUTES',
                                "message": "Task '$task_name' appears orphaned - parent task '$parent_task' completed but child still running",
                                "severity": "WARNING",
                                "processStatus": "alive"
                            }'
                            alerts_generated=$((alerts_generated + 1))
                        fi
                    fi
                fi
            fi
        fi
    done
    
    # Clean up temporary files
    rm -rf "$temp_dir"
    
    emit_task_event "PROGRESS" "taskWatchdog" "system" '{
        "message": "Task health analysis completed",
        "alertsGenerated": '$alerts_generated',
        "analysisType": "task_anomaly_detection"
    }'
    
    return 0
}

# Function to analyze system resource trends
analyze_resource_trends() {
    local events_file="$EVENTS_FILE"
    local alerts_generated=0
    
    emit_task_event "PROGRESS" "taskWatchdog" "system" '{
        "message": "Starting resource trend analysis",
        "eventsFile": "'$events_file'"
    }'
    
    # Get recent system context data from events
    local recent_events=$(tail -n 50 "$events_file" | grep '"systemContext"' || echo "")
    
    if [[ -n "$recent_events" ]]; then
        # Extract memory usage trends (simplified analysis)
        local high_memory_count=$(echo "$recent_events" | grep -o '"memoryUsagePercent":"[0-9.]*"' | sed 's/.*"\([0-9.]*\)".*/\1/' | awk '$1 > 85 {count++} END {print count+0}')
        local neo4j_down_count=$(echo "$recent_events" | grep -c '"neo4jStatus":"inaccessible"' 2>/dev/null | tr -d '\n' || echo "0")
        
        if [[ "$high_memory_count" -gt 5 ]]; then
            emit_task_event "HEALTH_ALERT" "taskWatchdog" "system" '{
                "alertType": "HIGH_MEMORY_USAGE",
                "highMemoryEventCount": '$high_memory_count',
                "message": "Detected '$high_memory_count' recent events with memory usage > 85%",
                "severity": "WARNING",
                "resourceType": "memory"
            }'
            alerts_generated=$((alerts_generated + 1))
        fi
        
        if [[ "$neo4j_down_count" -gt 3 ]]; then
            emit_task_event "HEALTH_ALERT" "taskWatchdog" "system" '{
                "alertType": "NEO4J_CONNECTIVITY_ISSUES",
                "inaccessibleEventCount": '$neo4j_down_count',
                "message": "Detected '$neo4j_down_count' recent events with Neo4j inaccessible",
                "severity": "ERROR",
                "resourceType": "database"
            }'
            alerts_generated=$((alerts_generated + 1))
        fi
    fi
    
    emit_task_event "PROGRESS" "taskWatchdog" "system" '{
        "message": "Resource trend analysis completed",
        "alertsGenerated": '$alerts_generated',
        "analysisType": "resource_trend_analysis"
    }'
    
    return 0
}

# Main watchdog execution
main() {
    emit_task_event "PROGRESS" "taskWatchdog" "system" '{
        "message": "Running Task Watchdog health checks",
        "phase": "main_execution"
    }'
    
    # Analyze task health
    analyze_task_health
    
    # Analyze resource trends
    analyze_resource_trends
    
    emit_task_event "TASK_END" "taskWatchdog" "system" '{
        "status": "success",
        "message": "Task Watchdog health checks completed successfully",
        "component": "healthMonitor",
        "watchdogType": "taskMonitor"
    }'
}

# Execute main function
main "$@"

exit 0
