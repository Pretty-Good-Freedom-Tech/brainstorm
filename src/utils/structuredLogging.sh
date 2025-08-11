#!/bin/bash

# Structured Logging Utility Library
# Provides consistent, parseable logging and event emission across all Brainstorm scripts
#
# Usage:
#   source /path/to/structuredLogging.sh
#   log_structured "INFO" "Script started" "script_name=processCustomer"
#   emit_task_event "TASK_START" "processCustomer" "$CUSTOMER_PUBKEY" '{"customerId":"'$CUSTOMER_ID'"}''
#
# Configuration Options:
#   BRAINSTORM_STRUCTURED_LOGGING=true|false    # Enable/disable all structured logging
#   BRAINSTORM_HUMAN_LOGS=true|false           # Enable/disable human-readable structured.log
#   BRAINSTORM_HUMAN_LOG_VERBOSITY=MINIMAL|NORMAL|VERBOSE  # Control human log verbosity
#   BRAINSTORM_LOG_LEVEL=ERROR|WARN|INFO|DEBUG  # Minimum log level to output
#   BRAINSTORM_EVENTS_MAX_SIZE=10000            # Max lines in events.jsonl before rotation
#
# Verbosity Levels:
#   MINIMAL: Only errors and critical task events (TASK_START/END/ERROR)
#   NORMAL:  Most events except verbose PROGRESS events (default)
#   VERBOSE: All events including detailed PROGRESS events

# Configuration
BRAINSTORM_LOG_LEVEL=${BRAINSTORM_LOG_LEVEL:-"INFO"}
BRAINSTORM_STRUCTURED_LOGGING=${BRAINSTORM_STRUCTURED_LOGGING:-"true"}
BRAINSTORM_HUMAN_LOGS=${BRAINSTORM_HUMAN_LOGS:-"true"}
BRAINSTORM_HUMAN_LOG_VERBOSITY=${BRAINSTORM_HUMAN_LOG_VERBOSITY:-"NORMAL"}
BRAINSTORM_EVENTS_MAX_SIZE=${BRAINSTORM_EVENTS_MAX_SIZE:-10000}

# Ensure required directories exist
ensure_logging_dirs() {
    local log_dir="${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}"
    local task_queue_dir="${log_dir}/taskQueue"
    
    mkdir -p "$task_queue_dir"
    
    # Set global variables for event files
    EVENTS_FILE="${task_queue_dir}/events.jsonl"
    STRUCTURED_LOG_FILE="${task_queue_dir}/structured.log"
    
    # Ensure log files exist and have correct ownership
    # This prevents permission issues when different processes (root vs brainstorm) create files
    touch "$EVENTS_FILE" "$STRUCTURED_LOG_FILE" 2>/dev/null || true
    
    # Fix ownership if we have sudo access (for systemd processes running as root)
    if command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
        sudo chown brainstorm:brainstorm "$EVENTS_FILE" "$STRUCTURED_LOG_FILE" 2>/dev/null || true
    fi
}

# Initialize directories and variables when script is sourced
ensure_logging_dirs

# Get ISO timestamp
get_iso_timestamp() {
    date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z'
}

# Log level checking
should_log_level() {
    local level="$1"
    
    case "$BRAINSTORM_LOG_LEVEL" in
        "ERROR") [[ "$level" == "ERROR" ]] && return 0 ;;
        "WARN") [[ "$level" =~ ^(ERROR|WARN)$ ]] && return 0 ;;
        "INFO") [[ "$level" =~ ^(ERROR|WARN|INFO)$ ]] && return 0 ;;
        "DEBUG") return 0 ;;
        *) [[ "$level" =~ ^(ERROR|WARN|INFO)$ ]] && return 0 ;;
    esac
    
    return 1
}

# Check if human logs should be written based on verbosity and event type
# Usage: should_write_human_log "EVENT_TYPE" "LOG_LEVEL"
should_write_human_log() {
    local event_type="$1"
    local log_level="${2:-INFO}"
    
    # If human logs are disabled, never write
    if [[ "$BRAINSTORM_HUMAN_LOGS" != "true" ]]; then
        return 1
    fi
    
    # Check verbosity level
    case "$BRAINSTORM_HUMAN_LOG_VERBOSITY" in
        "MINIMAL")
            # Only log errors and critical task events
            [[ "$log_level" == "ERROR" || "$event_type" =~ ^(TASK_START|TASK_END|TASK_ERROR)$ ]] && return 0
            ;;
        "NORMAL")
            # Log most events but skip some verbose progress events
            [[ "$event_type" != "PROGRESS" || "$log_level" =~ ^(WARN|ERROR)$ ]] && return 0
            ;;
        "VERBOSE")
            # Log everything
            return 0
            ;;
        *)
            # Default to NORMAL behavior
            [[ "$event_type" != "PROGRESS" || "$log_level" =~ ^(WARN|ERROR)$ ]] && return 0
            ;;
    esac
    
    return 1
}

# Structured logging function
# Usage: log_structured "LEVEL" "MESSAGE" "key1=value1 key2=value2"
log_structured() {
    local level="$1"
    local message="$2"
    local metadata="${3:-}"
    local timestamp=$(get_iso_timestamp)
    local script_name="${BASH_SOURCE[2]##*/}"
    local line_number="${BASH_LINENO[1]}"
    
    # Ensure directories exist
    ensure_logging_dirs
    
    # Check if we should log this level
    if ! should_log_level "$level"; then
        return 0
    fi
    
    # Create structured log entry
    local structured_entry="[$timestamp] [$level] [$script_name:$line_number] $message"
    if [[ -n "$metadata" ]]; then
        structured_entry="$structured_entry [$metadata]"
    fi
    
    # Output to console
    echo "$structured_entry"
    
    # Write to structured log file if both structured logging and human logs are enabled
    if [[ "$BRAINSTORM_STRUCTURED_LOGGING" == "true" && "$BRAINSTORM_HUMAN_LOGS" == "true" ]]; then
        echo "$structured_entry" >> "$STRUCTURED_LOG_FILE"
    fi
}

# Convenience functions for different log levels
log_debug() { log_structured "DEBUG" "$1" "$2"; }
log_info() { log_structured "INFO" "$1" "$2"; }
log_warn() { log_structured "WARN" "$1" "$2"; }
log_error() { log_structured "ERROR" "$1" "$2"; }

# Emit structured task event
# Usage: emit_task_event "EVENT_TYPE" "TASK_NAME" "TARGET" '{"key":"value"}'
emit_task_event() {
    local event_type="$1"
    local task_name="$2"
    local target="${3:-}"
    local metadata="$4"
    # Default to empty object if no metadata provided
    [[ -z "$metadata" ]] && metadata='{}'
    local timestamp=$(get_iso_timestamp)
    # Get script name from call stack - try different levels
    local script_name=""
    for i in {1..5}; do
        if [[ -n "${BASH_SOURCE[$i]}" ]]; then
            script_name="${BASH_SOURCE[$i]##*/}"
            break
        fi
    done
    [[ -z "$script_name" ]] && script_name="unknown"
    
    local pid=$$
    
    # Ensure directories exist
    ensure_logging_dirs
    
    # Skip if structured logging is disabled
    if [[ "$BRAINSTORM_STRUCTURED_LOGGING" != "true" ]]; then
        return 0
    fi

    # Ensure metadata is valid JSON, default to empty object if invalid
    if ! echo "$metadata" | jq empty 2>/dev/null; then
        metadata='{}'
    fi
    
    local event_json=$(cat <<EOF
{"timestamp":"$timestamp","eventType":"$event_type","taskName":"$task_name","target":"$target","metadata":$metadata,"scriptName":"$script_name","pid":$pid}
EOF
)
    
    # Append to events file
    echo "$event_json" >> "$EVENTS_FILE"
    
    # Rotate events file if it gets too large
    rotate_events_file_if_needed
    
    # Also log as structured message for human readability (respecting verbosity settings)
    if should_write_human_log "$event_type" "INFO"; then
        log_info "Task event: $event_type $task_name" "target=$target pid=$pid"
    fi
}

# Rotate events file if it exceeds max size
rotate_events_file_if_needed() {
    if [[ ! -f "$EVENTS_FILE" ]]; then
        return 0
    fi
    
    local line_count=$(wc -l < "$EVENTS_FILE" 2>/dev/null || echo "0")
    
    if [[ "$line_count" -gt "$BRAINSTORM_EVENTS_MAX_SIZE" ]]; then
        log_info "Rotating events file" "current_lines=$line_count max_lines=$BRAINSTORM_EVENTS_MAX_SIZE"
        
        # Keep the most recent half of the events
        local keep_lines=$((BRAINSTORM_EVENTS_MAX_SIZE / 2))
        tail -n "$keep_lines" "$EVENTS_FILE" > "${EVENTS_FILE}.tmp"
        mv "${EVENTS_FILE}.tmp" "$EVENTS_FILE"
        
        log_info "Events file rotated" "kept_lines=$keep_lines"
    fi
}

# Task timing helpers
start_task_timer() {
    local task_name="$1"
    local target="${2:-}"
    local metadata="${3:-{}}"
    
    # Store start time in a temporary file
    local timer_file="/tmp/brainstorm_task_timer_${task_name}_${target//\//_}_$$"
    get_iso_timestamp > "$timer_file"
    
    # Emit start event
    emit_task_event "TASK_START" "$task_name" "$target" "$metadata"
    
    # Return timer file path for end_task_timer
    echo "$timer_file"
}

end_task_timer() {
    local task_name="$1"
    local target="${2:-}"
    local exit_code="${3:-0}"
    local timer_file="$4"
    local additional_metadata="${5:-{}}"
    
    local end_time=$(get_iso_timestamp)
    local start_time=""
    local duration_seconds=""
    
    # Read start time if timer file exists
    if [[ -f "$timer_file" ]]; then
        start_time=$(cat "$timer_file")
        rm -f "$timer_file"
        
        # Calculate duration (basic implementation)
        local start_epoch=$(date -d "$start_time" +%s 2>/dev/null || echo "0")
        local end_epoch=$(date -d "$end_time" +%s 2>/dev/null || echo "0")
        duration_seconds=$((end_epoch - start_epoch))
    fi
    
    # Create metadata with timing and exit code
    local metadata=$(cat <<EOF
{"exitCode":$exit_code,"startTime":"$start_time","endTime":"$end_time","durationSeconds":$duration_seconds,"additional":$additional_metadata}
EOF
)
    
    # Emit completion event (standardized to TASK_END)
    local event_type="TASK_END"
    if [[ "$exit_code" != "0" ]]; then
        event_type="TASK_ERROR"
    fi
    
    emit_task_event "$event_type" "$task_name" "$target" "$metadata"
}

# Legacy compatibility function
# This allows existing scripts to gradually adopt structured logging
legacy_log_with_event() {
    local legacy_message="$1"
    local event_type="${2:-}"
    local task_name="${3:-}"
    local target="${4:-}"
    
    # Output legacy format for backward compatibility
    echo "$legacy_message"
    
    # Also emit structured event if parameters provided
    if [[ -n "$event_type" && -n "$task_name" ]]; then
        emit_task_event "$event_type" "$task_name" "$target" '{}'
    fi
}

# Initialize logging on source
ensure_logging_dirs

# Export functions for use in other scripts
export -f log_structured log_debug log_info log_warn log_error
export -f emit_task_event start_task_timer end_task_timer
export -f legacy_log_with_event ensure_logging_dirs
