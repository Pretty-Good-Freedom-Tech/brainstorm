#!/bin/bash

# Brainstorm Health Monitor - Task Behavior Monitor
# Monitors task execution patterns, detects anomalies, and maintains performance baselines
# Part of the Brainstorm Health Monitor (BHM) system
#
# This script orchestrates:
# - Task anomaly detection (stuck tasks, excessive runtime, silent failures)
# - Performance baseline tracking and deviation alerts
# - Task dependency and flow monitoring
#
# Usage: ./taskBehaviorMonitor.sh [--check-interval MINUTES] [--baseline-window HOURS]

set -e
set -o pipefail

# Configuration
CONFIG_FILE="/etc/brainstorm.conf"
if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE"
fi

# Determine base directory for development vs production
if [[ -z "$BRAINSTORM_MODULE_BASE_DIR" ]]; then
    # Development mode - determine from script location
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    # Get the directory where this script is located
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    # Find project root (contains package.json)
    PROJECT_ROOT="$(cd "$SCRIPT_DIR" && while [[ ! -f "package.json" && "$(pwd)" != "/" ]]; do cd ..; done && pwd)"

    # Source structured logging utilities
    STRUCTURED_LOGGING_UTILS="${PROJECT_ROOT}/src/utils/structuredLogging.sh"
    if [[ ! -f "$STRUCTURED_LOGGING_UTILS" ]]; then
        echo "Error: Cannot find structured logging utilities at $STRUCTURED_LOGGING_UTILS"
        echo "PROJECT_ROOT: $PROJECT_ROOT"
        exit 1
    fi
    source "$STRUCTURED_LOGGING_UTILS"
else
    # Production mode - use module base directory
    STRUCTURED_LOGGING_UTILS="${BRAINSTORM_MODULE_BASE_DIR}/src/utils/structuredLogging.sh"
    if [[ ! -f "$STRUCTURED_LOGGING_UTILS" ]]; then
        echo "Error: Cannot find structured logging utilities at $STRUCTURED_LOGGING_UTILS"
        exit 1
    fi
    source "$STRUCTURED_LOGGING_UTILS"
fi

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --check-interval)
            CHECK_INTERVAL_MINUTES="$2"
            shift 2
            ;;
        --baseline-window)
            BASELINE_WINDOW_HOURS="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# TBM component paths
TBM_DIR="$BRAINSTORM_MODULE_BASE_DIR/src/manage/healthMonitor"
ANOMALY_DETECTOR="$TBM_DIR/taskAnomalyDetector.js"
BASELINE_TRACKER="$TBM_DIR/taskPerformanceBaseline.js"

emit_task_event "TASK_START" "taskBehaviorMonitor" "system" '{
    "message": "Starting Task Behavior Monitor",
    "component": "healthMonitor",
    "monitorType": "taskBehavior",
    "checkIntervalMinutes": '"$CHECK_INTERVAL_MINUTES"',
    "baselineWindowHours": '"$BASELINE_WINDOW_HOURS"',
    "focus": "task_execution_health"
}'

# Function to run task anomaly detection
run_anomaly_detection() {
    emit_task_event "PROGRESS" "taskBehaviorMonitor" "anomaly_detection" '{
        "message": "Running task anomaly detection",
        "phase": "anomaly_detection",
        "component": "taskAnomalyDetector"
    }'
    
    if [[ -f "$ANOMALY_DETECTOR" ]]; then
        node "$ANOMALY_DETECTOR" \
            --threshold-multiplier "$ANOMALY_THRESHOLD_MULTIPLIER" \
            --stuck-timeout "$STUCK_TASK_TIMEOUT_MINUTES" \
            --check-interval "$CHECK_INTERVAL_MINUTES"
    else
        emit_task_event "HEALTH_ALERT" "taskBehaviorMonitor" "anomaly_detection" '{
            "alertType": "TBM_COMPONENT_MISSING",
            "severity": "warning",
            "message": "Task anomaly detector not found",
            "component": "taskAnomalyDetector",
            "path": "'"$ANOMALY_DETECTOR"'",
            "recommendedAction": "Install missing TBM component"
        }'
    fi
}

# Function to update performance baselines
update_performance_baselines() {
    emit_task_event "PROGRESS" "taskBehaviorMonitor" "baseline_tracking" '{
        "message": "Updating task performance baselines",
        "phase": "baseline_tracking",
        "component": "taskPerformanceBaseline"
    }'
    
    if [[ -f "$BASELINE_TRACKER" ]]; then
        node "$BASELINE_TRACKER" \
            --window-hours "$BASELINE_WINDOW_HOURS" \
            --update-baselines
    else
        emit_task_event "HEALTH_ALERT" "taskBehaviorMonitor" "baseline_tracking" '{
            "alertType": "TBM_COMPONENT_MISSING",
            "severity": "warning",
            "message": "Task performance baseline tracker not found",
            "component": "taskPerformanceBaseline",
            "path": "'"$BASELINE_TRACKER"'",
            "recommendedAction": "Install missing TBM component"
        }'
    fi
}

# Function to check task queue health
check_task_queue_health() {
    emit_task_event "PROGRESS" "taskBehaviorMonitor" "queue_health" '{
        "message": "Checking task queue health",
        "phase": "queue_health_check"
    }'
    
    # Check for task queue state files
    local queue_dir="${BRAINSTORM_LOG_DIR}/taskQueue"
    if [[ -d "$queue_dir" ]]; then
        local queue_size=$(find "$queue_dir" -name "*.json" -type f | wc -l)
        local oldest_task=""
        local queue_age_minutes=0
        
        if [[ "$queue_size" -gt 0 ]]; then
            oldest_task=$(find "$queue_dir" -name "*.json" -type f -printf '%T@ %p\n' | sort -n | head -1 | cut -d' ' -f2-)
            if [[ -n "$oldest_task" ]]; then
                local oldest_timestamp=$(stat -c %Y "$oldest_task" 2>/dev/null || echo "0")
                local current_timestamp=$(date +%s)
                queue_age_minutes=$(( (current_timestamp - oldest_timestamp) / 60 ))
            fi
        fi
        
        emit_task_event "PROGRESS" "taskBehaviorMonitor" "queue_health" '{
            "queueSize": '"$queue_size"',
            "oldestTaskAgeMinutes": '"$queue_age_minutes"',
            "queueDirectory": "'"$queue_dir"'"
        }'
        
        # Generate alerts for queue issues
        if [[ "$queue_size" -gt 50 ]]; then
            emit_task_event "HEALTH_ALERT" "taskBehaviorMonitor" "queue_health" '{
                "alertType": "TASK_QUEUE_BACKLOG",
                "severity": "warning",
                "message": "Task queue backlog detected",
                "component": "taskQueue",
                "queueSize": '"$queue_size"',
                "recommendedAction": "Investigate task processing bottlenecks"
            }'
        fi
        
        if [[ "$queue_age_minutes" -gt 120 ]]; then
            emit_task_event "HEALTH_ALERT" "taskBehaviorMonitor" "queue_health" '{
                "alertType": "TASK_QUEUE_STALE",
                "severity": "critical",
                "message": "Stale tasks in queue",
                "component": "taskQueue",
                "oldestTaskAgeMinutes": '"$queue_age_minutes"',
                "recommendedAction": "Check task queue processing system"
            }'
        fi
    else
        emit_task_event "HEALTH_ALERT" "taskBehaviorMonitor" "queue_health" '{
            "alertType": "TASK_QUEUE_MISSING",
            "severity": "warning",
            "message": "Task queue directory not found",
            "component": "taskQueue",
            "expectedPath": "'"$queue_dir"'",
            "recommendedAction": "Verify task queue system is initialized"
        }'
    fi
}

# Main monitoring function
main() {
    emit_task_event "PROGRESS" "taskBehaviorMonitor" "system" '{
        "message": "Running Task Behavior Monitor health checks",
        "phase": "main_execution",
        "focus": "task_execution_health"
    }'
    
    # Run anomaly detection
    run_anomaly_detection
    
    # Update performance baselines
    update_performance_baselines
    
    # Check task queue health
    check_task_queue_health
    
    emit_task_event "TASK_END" "taskBehaviorMonitor" "system" '{
        "status": "success",
        "message": "Task Behavior Monitor health checks completed successfully",
        "component": "healthMonitor",
        "monitorType": "taskBehavior",
        "checksPerformed": ["anomaly_detection", "baseline_tracking", "queue_health"],
        "focus": "task_execution_health"
    }'
}

# Execute main function
main "$@"
exit 0
