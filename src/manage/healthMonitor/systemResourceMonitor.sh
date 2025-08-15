#!/bin/bash

# Brainstorm Health Monitor - System Resource Monitor
# Monitors system resources with special emphasis on Neo4j health
# Part of the Brainstorm Health Monitor (BHM) system
#
# This script monitors:
# - Neo4j service status, memory usage, and query performance
# - System memory, CPU, and disk usage
# - strfry process health
# - Network connectivity to critical services
# - Java garbage collection metrics (Neo4j)
#
# Usage: ./systemResourceMonitor.sh [--check-interval MINUTES] [--neo4j-memory-threshold MB]

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
    BRAINSTORM_MODULE_BASE_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
fi

# Source structured logging utilities
STRUCTURED_LOGGING_PATH="$BRAINSTORM_MODULE_BASE_DIR/src/utils/structuredLogging.sh"
if [[ ! -f "$STRUCTURED_LOGGING_PATH" ]]; then
    echo "Error: Cannot find structured logging utilities at $STRUCTURED_LOGGING_PATH"
    echo "BRAINSTORM_MODULE_BASE_DIR: $BRAINSTORM_MODULE_BASE_DIR"
    exit 1
fi
source "$STRUCTURED_LOGGING_PATH"

# Default configuration
CHECK_INTERVAL_MINUTES=5
NEO4J_MEMORY_THRESHOLD_MB=1024
NEO4J_HEAP_WARNING_PERCENT=80
NEO4J_HEAP_CRITICAL_PERCENT=95
SYSTEM_MEMORY_WARNING_PERCENT=85
SYSTEM_MEMORY_CRITICAL_PERCENT=95
DISK_WARNING_PERCENT=85
DISK_CRITICAL_PERCENT=95

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --check-interval)
            CHECK_INTERVAL_MINUTES="$2"
            shift 2
            ;;
        --neo4j-memory-threshold)
            NEO4J_MEMORY_THRESHOLD_MB="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

emit_metadata=$(cat <<EOF
{
    "message": "Starting System Resource Monitor",
    "component": "healthMonitor",
    "monitorType": "systemResources",
    "checkIntervalMinutes": "$CHECK_INTERVAL_MINUTES",
    "neo4jMemoryThresholdMB": "$NEO4J_MEMORY_THRESHOLD_MB",
    "focus": "neo4j_health_monitoring"
}
EOF
)

emit_task_event "TASK_START" "systemResourceMonitor" "system" "$emit_metadata"

# Function to check Neo4j service status
check_neo4j_status() {
    local neo4j_status="unknown"
    local neo4j_pid=""
    local neo4j_memory_mb=0
    local neo4j_heap_usage=""
    local neo4j_gc_info=""
    local connection_test="failed"
    local query_response_time=""
    
    emit_task_event "PROGRESS" "systemResourceMonitor" "neo4j" '{
        "message": "Checking Neo4j service status",
        "phase": "neo4j_health_check"
    }'
    
    # Check if Neo4j process is running
    if pgrep -f "neo4j" > /dev/null 2>&1; then
        neo4j_status="running"
        neo4j_pid=$(pgrep -f "neo4j" | head -1)
        
        # Get Neo4j memory usage
        if [[ -n "$neo4j_pid" ]]; then
            # Memory usage in MB
            neo4j_memory_mb=$(ps -p "$neo4j_pid" -o rss= 2>/dev/null | awk '{print int($1/1024)}' || echo "0")
            
            # Try to get Java heap information
            if command -v jstat >/dev/null 2>&1; then
                neo4j_heap_usage=$(jstat -gc "$neo4j_pid" 2>/dev/null | tail -1 | awk '{
                    used = ($3 + $4 + $6 + $8) * 1024
                    total = ($1 + $2 + $5 + $7) * 1024
                    if (total > 0) {
                        percent = (used / total) * 100
                        printf "%.1f%% (%.1fMB/%.1fMB)", percent, used/1024/1024, total/1024/1024
                    } else {
                        print "unknown"
                    }
                }' || echo "unknown")
                
                # Get GC information
                neo4j_gc_info=$(jstat -gc "$neo4j_pid" 2>/dev/null | tail -1 | awk '{
                    printf "YGC:%d,YGCT:%.2fs,FGC:%d,FGCT:%.2fs", $12, $13, $14, $15
                }' || echo "unknown")
            fi
        fi
        
        # Test Neo4j connectivity and response time
        if command -v curl >/dev/null 2>&1; then
            local start_time=$(date +%s%3N)
            if curl -s -f "http://localhost:7474/" >/dev/null 2>&1; then
                local end_time=$(date +%s%3N)
                connection_test="success"
                query_response_time="$((end_time - start_time))ms"
            else
                connection_test="failed"
            fi
        fi
    else
        neo4j_status="stopped"
    fi
    
    # Emit Neo4j health status
    local neo4j_metadata=$(cat <<EOF
{
    "status": "'$neo4j_status'",
    "pid": "'$neo4j_pid'",
    "memoryUsageMB": '$neo4j_memory_mb',
    "heapUsage": "'$neo4j_heap_usage'",
    "gcInfo": "'$neo4j_gc_info'",
    "connectionTest": "'$connection_test'",
    "responseTime": "'$query_response_time'"
}
EOF
    
    emit_task_event "PROGRESS" "systemResourceMonitor" "neo4j" "$neo4j_metadata"
    
    # Generate alerts for Neo4j issues
    if [[ "$neo4j_status" != "running" ]]; then
        local neo4j_alert_metadata=$(cat <<EOF
{
    "alertType": "NEO4J_SERVICE_DOWN",
    "severity": "critical",
    "message": "Neo4j service is not running",
    "component": "neo4j",
    "status": "'$neo4j_status'",
    "recommendedAction": "Check Neo4j logs and restart service"
}
EOF
        emit_task_event "HEALTH_ALERT" "systemResourceMonitor" "neo4j" "$neo4j_alert_metadata"
    elif [[ "$connection_test" == "failed" ]]; then
        local neo4j_alert_metadata=$(cat <<EOF
{
    "alertType": "NEO4J_CONNECTION_FAILED",
    "severity": "critical",
    "message": "Neo4j service running but not responding to HTTP requests",
    "component": "neo4j",
    "pid": "'$neo4j_pid'",
    "recommendedAction": "Check Neo4j HTTP connector configuration and logs"
}
EOF
        emit_task_event "HEALTH_ALERT" "systemResourceMonitor" "neo4j" "$neo4j_alert_metadata"
    elif [[ "$neo4j_memory_mb" -gt "$NEO4J_MEMORY_THRESHOLD_MB" ]]; then
        local neo4j_alert_metadata=$(cat <<EOF
{
    "alertType": "NEO4J_HIGH_MEMORY_USAGE",
    "severity": "warning",
    "message": "Neo4j memory usage exceeds threshold",
    "component": "neo4j",
    "memoryUsageMB": '$neo4j_memory_mb',
    "thresholdMB": '$NEO4J_MEMORY_THRESHOLD_MB',
    "recommendedAction": "Monitor for memory leaks, consider heap tuning"
}
EOF
        emit_task_event "HEALTH_ALERT" "systemResourceMonitor" "neo4j" "$neo4j_alert_metadata"
    fi
    
    # Check heap usage percentage if available
    if [[ "$neo4j_heap_usage" != "unknown" && "$neo4j_heap_usage" != "" ]]; then
        local heap_percent=$(echo "$neo4j_heap_usage" | grep -o '^[0-9.]*' || echo "0")
        if (( $(echo "$heap_percent > $NEO4J_HEAP_CRITICAL_PERCENT" | bc -l 2>/dev/null || echo "0") )); then
            local neo4j_alert_metadata=$(cat <<EOF
{
    "alertType": "NEO4J_HEAP_CRITICAL",
    "severity": "critical",
    "message": "Neo4j heap usage critically high",
    "component": "neo4j",
    "heapUsage": "'$neo4j_heap_usage'",
    "heapPercent": '$heap_percent',
    "threshold": '$NEO4J_HEAP_CRITICAL_PERCENT',
    "recommendedAction": "Immediate attention required - increase heap size or restart Neo4j"
}
EOF
            emit_task_event "HEALTH_ALERT" "systemResourceMonitor" "neo4j" "$neo4j_alert_metadata"
        elif (( $(echo "$heap_percent > $NEO4J_HEAP_WARNING_PERCENT" | bc -l 2>/dev/null || echo "0") )); then
            local neo4j_alert_metadata=$(cat <<EOF
{
    "alertType": "NEO4J_HEAP_WARNING",
    "severity": "warning",
    "message": "Neo4j heap usage high",
    "component": "neo4j",
    "heapUsage": "'$neo4j_heap_usage'",
    "heapPercent": '$heap_percent',
    "threshold": '$NEO4J_HEAP_WARNING_PERCENT',
    "recommendedAction": "Monitor heap usage trends, consider optimization"
}
EOF
            emit_task_event "HEALTH_ALERT" "systemResourceMonitor" "neo4j" "$neo4j_alert_metadata"
        fi
    fi
}

# Function to check strfry status
check_strfry_status() {
    local strfry_status="unknown"
    local strfry_pid=""
    local strfry_memory_mb=0
    
    emit_task_event "PROGRESS" "systemResourceMonitor" "strfry" '{
        "message": "Checking strfry service status",
        "phase": "strfry_health_check"
    }'
    
    # Check if strfry process is running
    if pgrep -f "strfry" > /dev/null 2>&1; then
        strfry_status="running"
        strfry_pid=$(pgrep -f "strfry" | head -1)
        
        # Get strfry memory usage
        if [[ -n "$strfry_pid" ]]; then
            strfry_memory_mb=$(ps -p "$strfry_pid" -o rss= 2>/dev/null | awk '{print int($1/1024)}' || echo "0")
        fi
    else
        strfry_status="stopped"
    fi
    
    # Emit strfry health status
    local strfry_metadata=$(cat <<EOF
{
    "status": "'$strfry_status'",
    "pid": "'$strfry_pid'",
    "memoryUsageMB": '$strfry_memory_mb'
}
EOF
    emit_task_event "PROGRESS" "systemResourceMonitor" "strfry" "$strfry_metadata"
    
    # Generate alert if strfry is down
    if [[ "$strfry_status" != "running" ]]; then
        local strfry_alert_metadata=$(cat <<EOF
{
    "alertType": "STRFRY_SERVICE_DOWN",
    "severity": "critical",
    "message": "strfry service is not running",
    "component": "strfry",
    "status": "'$strfry_status'",
    "recommendedAction": "Check strfry configuration and restart service"
}
EOF
        emit_task_event "HEALTH_ALERT" "systemResourceMonitor" "strfry" "$strfry_alert_metadata"
    fi
}

# Function to check system resources
check_system_resources() {
    emit_task_event "PROGRESS" "systemResourceMonitor" "system" '{
        "message": "Checking system resource usage",
        "phase": "system_resource_check"
    }'
    
    # Get system memory usage
    local memory_info=""
    local memory_percent=0
    if [[ "$(uname)" == "Darwin" ]]; then
        # macOS
        memory_info=$(vm_stat | awk '
            /Pages free/ { free = $3 }
            /Pages active/ { active = $3 }
            /Pages inactive/ { inactive = $3 }
            /Pages speculative/ { spec = $3 }
            /Pages wired/ { wired = $3 }
            END {
                gsub(/[^0-9]/, "", free)
                gsub(/[^0-9]/, "", active)
                gsub(/[^0-9]/, "", inactive)
                gsub(/[^0-9]/, "", spec)
                gsub(/[^0-9]/, "", wired)
                page_size = 4096
                total_pages = free + active + inactive + spec + wired
                used_pages = active + inactive + wired
                total_mb = (total_pages * page_size) / 1024 / 1024
                used_mb = (used_pages * page_size) / 1024 / 1024
                percent = (used_mb / total_mb) * 100
                printf "%.1f%% (%.0fMB/%.0fMB)", percent, used_mb, total_mb
            }
        ')
        memory_percent=$(echo "$memory_info" | grep -o '^[0-9.]*' || echo "0")
    else
        # Linux
        memory_info=$(free -m | awk 'NR==2{
            total=$2; used=$3; percent=(used/total)*100
            printf "%.1f%% (%dMB/%dMB)", percent, used, total
        }')
        memory_percent=$(echo "$memory_info" | grep -o '^[0-9.]*' || echo "0")
    fi
    
    # Get disk usage for root filesystem
    local disk_info=$(df -h / | awk 'NR==2{print $5 " (" $3 "/" $2 ")"}')
    local disk_percent=$(echo "$disk_info" | grep -o '^[0-9]*' || echo "0")
    
    # Get load average
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | sed 's/^ *//')
    
    # Emit system resource status
    local system_metadata=$(cat <<EOF
{
    "memoryUsage": "'$memory_info'",
    "memoryPercent": '$memory_percent',
    "diskUsage": "'$disk_info'",
    "diskPercent": '$disk_percent',
    "loadAverage": "'$load_avg'"
}
EOF
    emit_task_event "PROGRESS" "systemResourceMonitor" "system" "$system_metadata"
    
    # Generate memory alerts
    if (( $(echo "$memory_percent > $SYSTEM_MEMORY_CRITICAL_PERCENT" | bc -l 2>/dev/null || echo "0") )); then
        local system_alert_metadata=$(cat <<EOF
{
    "alertType": "SYSTEM_MEMORY_CRITICAL",
    "severity": "critical",
    "message": "System memory usage critically high",
    "component": "system",
    "memoryUsage": "'$memory_info'",
    "memoryPercent": '$memory_percent',
    "threshold": '$SYSTEM_MEMORY_CRITICAL_PERCENT',
    "recommendedAction": "Free memory immediately or restart services"
}
EOF
        emit_task_event "HEALTH_ALERT" "systemResourceMonitor" "system" "$system_alert_metadata"
    elif (( $(echo "$memory_percent > $SYSTEM_MEMORY_WARNING_PERCENT" | bc -l 2>/dev/null || echo "0") )); then
        local system_alert_metadata=$(cat <<EOF
{
    "alertType": "SYSTEM_MEMORY_WARNING",
    "severity": "warning",
    "message": "System memory usage high",
    "component": "system",
    "memoryUsage": "'$memory_info'",
    "memoryPercent": '$memory_percent',
    "threshold": '$SYSTEM_MEMORY_WARNING_PERCENT',
    "recommendedAction": "Monitor memory usage and consider optimization"
}
EOF
        emit_task_event "HEALTH_ALERT" "systemResourceMonitor" "system" "$system_alert_metadata"
    fi
    
    # Generate disk alerts
    if (( disk_percent > DISK_CRITICAL_PERCENT )); then
        local system_alert_metadata=$(cat <<EOF
{
    "alertType": "SYSTEM_DISK_CRITICAL",
    "severity": "critical",
    "message": "System disk usage critically high",
    "component": "system",
    "diskUsage": "'$disk_info'",
    "diskPercent": '$disk_percent',
    "threshold": '$DISK_CRITICAL_PERCENT',
    "recommendedAction": "Free disk space immediately"
}
EOF
        emit_task_event "HEALTH_ALERT" "systemResourceMonitor" "system" "$system_alert_metadata"
    elif (( disk_percent > DISK_WARNING_PERCENT )); then
        local system_alert_metadata=$(cat <<EOF
{
    "alertType": "SYSTEM_DISK_WARNING",
    "severity": "critical",
    "message": "System disk usage critically high",
    "component": "system",
    "diskUsage": "'$disk_info'",
    "diskPercent": '$disk_percent',
    "threshold": '$DISK_CRITICAL_PERCENT',
    "recommendedAction": "Free disk space immediately"
}
EOF
        emit_task_event "HEALTH_ALERT" "systemResourceMonitor" "system" "$system_alert_metadata"
    elif (( disk_percent > DISK_WARNING_PERCENT )); then
        local system_alert_metadata=$(cat <<EOF
{
    "alertType": "SYSTEM_DISK_WARNING",
    "severity": "warning",
    "message": "System disk usage high",
    "component": "system",
    "diskUsage": "'$disk_info'",
    "diskPercent": '$disk_percent',
    "threshold": '$DISK_WARNING_PERCENT',
    "recommendedAction": "Clean up disk space"
}
EOF
        emit_task_event "HEALTH_ALERT" "systemResourceMonitor" "system" "$system_alert_metadata"
    fi
}

# Main monitoring function
main() {
    emit_task_event "PROGRESS" "systemResourceMonitor" "system" '{
        "message": "Running System Resource Monitor health checks",
        "phase": "main_execution",
        "focus": "neo4j_health_monitoring"
    }'
    
    # Check Neo4j health (primary focus)
    check_neo4j_status
    
    # Check strfry health
    check_strfry_status
    
    # Check system resources
    check_system_resources
    
    emit_task_event "TASK_END" "systemResourceMonitor" "system" '{
        "status": "success",
        "message": "System Resource Monitor health checks completed successfully",
        "component": "healthMonitor",
        "monitorType": "systemResources",
        "checksPerformed": ["neo4j_health", "strfry_health", "system_resources"],
        "focus": "neo4j_health_monitoring"
    }'
}

# Execute main function
main "$@"
exit 0
