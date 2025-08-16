#!/bin/bash

# Brainstorm Health Monitor - Application Health Monitor
# Monitors application services, processes, and endpoints

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
    echo "SCRIPT_DIR: $SCRIPT_DIR"
    exit 1
fi
source "$STRUCTURED_LOGGING_PATH"

SCRIPT_NAME="applicationHealthMonitor"
TARGET="${1:-owner}"

# Configurable verbosity for monitoring tasks
# BRAINSTORM_MONITORING_VERBOSITY: full, alerts, minimal
MONITORING_VERBOSITY="${BRAINSTORM_MONITORING_VERBOSITY:-alerts}"

# Source configuration and logging
BRAINSTORM_LOG_DIR="${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}"
BRAINSTORM_DATA_DIR="${BRAINSTORM_DATA_DIR:-/var/lib/brainstorm}"

LOG_FILE="${BRAINSTORM_LOG_DIR}/${SCRIPT_NAME}.log"
EVENTS_LOG="${BRAINSTORM_LOG_DIR}/taskQueue/events.jsonl"

# Ensure log directories exist
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$EVENTS_LOG")"

# Application components to monitor
declare -A APP_COMPONENTS=(
    ["strfry"]="strfry relay"
    ["brainstorm-control-panel"]="node.*brainstorm.*control.*panel"
    ["neo4j"]="neo4j"
    ["taskQueueManager"]="taskQueueManager"
    ["taskWatchdog"]="taskWatchdog"
)

# Expected ports for services
declare -A SERVICE_PORTS=(
    ["strfry"]="7777"
    ["brainstorm-control-panel"]="3000"
    ["neo4j"]="7474,7687"
)

# Configurable logging based on verbosity level
emit_monitoring_event() {
    local event_type="$1"
    local message="$2"
    local metadata="${3:-}"
    
    # Ensure metadata is not empty or null
    if [[ -z "$metadata" ]]; then
        metadata="{}"
    fi
    
    case "$MONITORING_VERBOSITY" in
        "full")
            emit_task_event "$event_type" "$SCRIPT_NAME" "$TARGET" "$metadata"
            ;;
        "alerts")
            if [[ "$event_type" == "HEALTH_ALERT" || "$event_type" == "TASK_START" || "$event_type" == "TASK_END" || "$event_type" == "TASK_ERROR" ]]; then
                emit_task_event "$event_type" "$SCRIPT_NAME" "$TARGET" "$metadata"
            fi
            ;;
        "minimal")
            if [[ "$event_type" == "HEALTH_ALERT" || "$event_type" == "TASK_ERROR" ]]; then
                emit_task_event "$event_type" "$SCRIPT_NAME" "$TARGET" "$metadata"
            fi
            ;;
    esac
}

# Health alert function
send_health_alert() {
    local alert_type="$1"
    local severity="$2"
    local message="$3"
    local additional_data="${4:-}"
    
    # Ensure additional_data is not empty or null
    if [[ -z "$additional_data" ]]; then
        additional_data="{}"
    fi
    
    # Escape quotes in message for JSON
    local escaped_message=$(echo "$message" | sed 's/"/\\"/g')
    
    # Construct metadata as single-line JSON to avoid formatting issues
    local metadata="{\"alertType\":\"$alert_type\",\"severity\":\"$severity\",\"component\":\"application_health\",\"message\":\"$escaped_message\",\"recommendedAction\":\"Review application component status and logs\",\"additionalData\":$additional_data}"
    
    # Validate and compact JSON if jq is available
    if command -v jq >/dev/null 2>&1; then
        if echo "$metadata" | jq empty 2>/dev/null; then
            metadata=$(echo "$metadata" | jq -c .)
        else
            metadata="{\"alertType\":\"$alert_type\",\"severity\":\"$severity\",\"component\":\"application_health\",\"message\":\"$escaped_message\",\"recommendedAction\":\"Review application component status and logs\",\"additionalData\":{}}"
        fi
    fi
    
    emit_monitoring_event "HEALTH_ALERT" "$message" "$metadata"
}

# Check if process is running
check_process() {
    local service_name="$1"
    local process_pattern="$2"
    
    local pids=$(pgrep -f "$process_pattern" 2>/dev/null || echo "")
    local process_count=$(echo "$pids" | grep -c . 2>/dev/null | tr -d '\n' || echo "0")
    
    local process_info="{\"service\": \"$service_name\", \"pattern\": \"$process_pattern\", \"processCount\": $process_count"
    
    if [[ $process_count -gt 0 ]]; then
        local pid_list=$(echo "$pids" | tr '\n' ',' | sed 's/,$//')
        local memory_usage=0
        local cpu_usage=0
        
        # Get memory and CPU usage for the processes
        for pid in $pids; do
            if [[ -f "/proc/$pid/status" ]]; then
                local mem_kb=$(grep VmRSS /proc/$pid/status 2>/dev/null | awk '{print $2}' || echo "0")
                memory_usage=$((memory_usage + mem_kb))
            fi
        done
        
        # Convert memory to MB
        local memory_mb=$(echo "scale=2; $memory_usage / 1024" | bc)
        
        process_info+=", \"status\": \"running\", \"pids\": \"$pid_list\", \"memoryMB\": $memory_mb"
    else
        process_info+=", \"status\": \"stopped\", \"pids\": \"\", \"memoryMB\": 0"
    fi
    
    process_info+="}"
    echo "$process_info"
}

# Check port availability
check_port() {
    local port="$1"
    local timeout="${2:-3}"
    
    if timeout "$timeout" bash -c "exec 3<>/dev/tcp/localhost/$port" 2>/dev/null; then
        exec 3<&-
        exec 3>&-
        return 0
    else
        return 1
    fi
}

# Test HTTP endpoint
test_http_endpoint() {
    local url="$1"
    local timeout="${2:-10}"
    
    local response_code=$(curl -o /dev/null -s -w "%{http_code}" --connect-timeout "$timeout" --max-time "$timeout" "$url" 2>/dev/null || echo "000")
    local response_time=$(curl -o /dev/null -s -w "%{time_total}" --connect-timeout "$timeout" --max-time "$timeout" "$url" 2>/dev/null || echo "-1")
    
    echo "{\"responseCode\": $response_code, \"responseTime\": $response_time}"
}

# Check log files for errors
check_recent_errors() {
    local service_name="$1"
    local log_pattern="${2:-$service_name}"
    local hours="${3:-1}"
    
    local error_count=0
    local warning_count=0
    local recent_errors=()
    
    # Look for log files
    local log_files=()
    if [[ -f "${BRAINSTORM_LOG_DIR}/${log_pattern}.log" ]]; then
        log_files+=("${BRAINSTORM_LOG_DIR}/${log_pattern}.log")
    fi
    
    # Check systemd logs if available
    if command -v journalctl >/dev/null 2>&1; then
        local journal_errors=$(journalctl -u "$service_name" --since="${hours} hours ago" --no-pager -q 2>/dev/null | grep -i error | wc -l 2>/dev/null | tr -d '\n' || echo "0")
        error_count=$((error_count + journal_errors))
        
        local journal_warnings=$(journalctl -u "$service_name" --since="${hours} hours ago" --no-pager -q 2>/dev/null | grep -i warning | wc -l 2>/dev/null | tr -d '\n' || echo "0")
        warning_count=$((warning_count + journal_warnings))
    fi
    
    # Check log files
    for log_file in "${log_files[@]}"; do
        if [[ -f "$log_file" ]]; then
            local file_errors=$(find "$log_file" -newermt "${hours} hours ago" -exec grep -i error {} \; 2>/dev/null | wc -l 2>/dev/null | tr -d '\n' || echo "0")
            error_count=$((error_count + file_errors))
            
            local file_warnings=$(find "$log_file" -newermt "${hours} hours ago" -exec grep -i warning {} \; 2>/dev/null | wc -l 2>/dev/null | tr -d '\n' || echo "0")
            warning_count=$((warning_count + file_warnings))
        fi
    done
    
    echo "{\"service\": \"$service_name\", \"errorCount\": $error_count, \"warningCount\": $warning_count, \"hoursChecked\": $hours}"
}

# Monitor application health
monitor_application_health() {
    
    local service_results=()
    local failed_services=0
    local total_services=0
    
    # Check each application component
    for service_name in "${!APP_COMPONENTS[@]}"; do
        local process_pattern="${APP_COMPONENTS[$service_name]}"
        total_services=$((total_services + 1))
        
        # Check process status
        local process_info=$(check_process "$service_name" "$process_pattern")
        local process_status=$(echo "$process_info" | jq -r '.status' 2>/dev/null || echo "unknown")
        
        # Check ports if defined
        local port_status="{}"
        if [[ -n "${SERVICE_PORTS[$service_name]:-}" ]]; then
            local ports="${SERVICE_PORTS[$service_name]}"
            local port_results=()
            
            IFS=',' read -ra PORT_ARRAY <<< "$ports"
            for port in "${PORT_ARRAY[@]}"; do
                if check_port "$port" 3; then
                    port_results+=("{\"port\": $port, \"status\": \"open\"}")
                else
                    port_results+=("{\"port\": $port, \"status\": \"closed\"}")
                fi
            done
            
            local ports_json=$(IFS=','; echo "[${port_results[*]}]")
            port_status="{\"ports\": $ports_json}"
        fi
        
        # Check for recent errors
        local error_info=$(check_recent_errors "$service_name" "$service_name" 1)
        
        # Test HTTP endpoints for web services
        local endpoint_status="{}"
        case "$service_name" in
            "brainstorm-control-panel")
                endpoint_status=$(test_http_endpoint "http://localhost:3000/api/health" 10)
                ;;
            "neo4j")
                endpoint_status=$(test_http_endpoint "http://localhost:7474" 10)
                ;;
        esac
        
        # Combine service information
        local service_result=$(cat <<EOF
{
  "service": "$service_name",
  "process": $process_info,
  "ports": $port_status,
  "errors": $error_info,
  "endpoint": $endpoint_status,
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")"
}
EOF
)
        
        service_results+=("$service_result")
        
        # Check for failures and send alerts
        if [[ "$process_status" == "stopped" ]]; then
            failed_services=$((failed_services + 1))
            send_health_alert "APPLICATION_SERVICE_DOWN" "critical" "Service not running: $service_name" "$service_result"
        fi
        
        # Check error counts
        local error_count=$(echo "$error_info" | jq -r '.errorCount' 2>/dev/null || echo "0")
        if [[ $error_count -gt 10 ]]; then
            send_health_alert "APPLICATION_HIGH_ERRORS" "warning" "High error count for $service_name: $error_count errors in last hour" "$error_info"
        fi
        
        emit_monitoring_event "SERVICE_CHECK" "Checked service: $service_name" "$service_result"
    done
    
    # Check overall application health
    local success_rate=0
    if [[ $total_services -gt 0 ]]; then
        success_rate=$(echo "scale=2; ($total_services - $failed_services) * 100 / $total_services" | bc)
    fi
    
    if [[ $failed_services -gt 0 ]]; then
        if (( $(echo "$success_rate < 50" | bc -l) )); then
            send_health_alert "APPLICATION_HEALTH_CRITICAL" "critical" "Multiple application services down: ${success_rate}% success rate" "{\"successRate\": $success_rate, \"failedServices\": $failed_services}"
        elif (( $(echo "$success_rate < 80" | bc -l) )); then
            send_health_alert "APPLICATION_HEALTH_WARNING" "warning" "Application health degraded: ${success_rate}% success rate" "{\"successRate\": $success_rate, \"failedServices\": $failed_services}"
        fi
    fi
    
    # Check disk space for application directories
    local disk_checks=()
    for dir in "$BRAINSTORM_LOG_DIR" "$BRAINSTORM_DATA_DIR"; do
        if [[ -d "$dir" ]]; then
            local disk_usage=$(df -h "$dir" | tail -1 | awk '{print $5}' | tr -d '%')
            local available_space=$(df -h "$dir" | tail -1 | awk '{print $4}')
            disk_checks+=("{\"directory\": \"$dir\", \"usagePercent\": $disk_usage, \"availableSpace\": \"$available_space\"}")
            
            if [[ $disk_usage -gt 90 ]]; then
                send_health_alert "APPLICATION_DISK_FULL" "critical" "Application directory disk usage critical: $dir ($disk_usage%)" "{\"directory\": \"$dir\", \"usage\": $disk_usage}"
            fi
        fi
    done
    
    local disk_json=$(IFS=','; echo "[${disk_checks[*]}]")
    
    # Combine all results
    local services_json=$(IFS=','; echo "[${service_results[*]}]")
    local combined_results=$(cat <<EOF
{
  "services": $services_json,
  "diskUsage": $disk_json,
  "summary": {
    "totalServices": $total_services,
    "failedServices": $failed_services,
    "successRate": $success_rate
  },
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")"
}
EOF
)
    
    emit_monitoring_event "PROGRESS" "Application health monitoring completed" "$combined_results"
}

# Main execution
main() {
    # Emit task start event for debugging
    emit_monitoring_event "TASK_START" "Starting Brainstorm Application Health Monitor" '{
        "message": "Starting application health monitoring",
        "component": "healthMonitor",
        "verbosity": "'$MONITORING_VERBOSITY'",
        "target": "'$TARGET'"
    }'
    
    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 <target>"
        echo "Example: $0 owner"
        exit 1
    fi
    
    monitor_application_health
    
    # Emit task end event for debugging
    emit_monitoring_event "TASK_END" "Application health monitoring completed successfully" '{
        "status": "success",
        "message": "Application health monitoring completed",
        "component": "healthMonitor"
    }'
}

# Execute main function
main "$@"
