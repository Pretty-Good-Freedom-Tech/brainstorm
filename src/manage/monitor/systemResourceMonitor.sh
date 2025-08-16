#!/bin/bash

# System Resource Monitor
# Monitors system resources (CPU, memory, disk, network) and detects resource constraints

set -euo pipefail

# Source configuration and logging
source "$(dirname "$0")/../lib/config.js" 2>/dev/null || {
    BRAINSTORM_LOG_DIR="${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}"
    BRAINSTORM_DATA_DIR="${BRAINSTORM_DATA_DIR:-/var/lib/brainstorm}"
    BRAINSTORM_MODULE_BASE_DIR="${BRAINSTORM_MODULE_BASE_DIR:-/usr/local/lib/node_modules/brainstorm}"
}

# Set monitoring verbosity (full, alerts, minimal)
MONITORING_VERBOSITY="${BRAINSTORM_MONITORING_VERBOSITY:-alerts}"

SCRIPT_NAME="systemResourceMonitor"
TARGET="${1:-owner}"
LOG_FILE="${BRAINSTORM_LOG_DIR}/${SCRIPT_NAME}.log"
EVENTS_LOG="${BRAINSTORM_LOG_DIR}/taskQueue/events.jsonl"

# Ensure log directories exist
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$EVENTS_LOG")"

# Source structured logging utilities
if [ -f "${BRAINSTORM_MODULE_BASE_DIR}/src/lib/structuredLogging.sh" ]; then
    source "${BRAINSTORM_MODULE_BASE_DIR}/src/lib/structuredLogging.sh"
else
    # Fallback emit_task_event function if structuredLogging.sh not found
    emit_task_event() {
        local event_type="$1"
        local message="$2"
        local metadata="${3:-{}}"
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
        echo "{\"timestamp\": \"$timestamp\", \"taskName\": \"$SCRIPT_NAME\", \"target\": \"$TARGET\", \"eventType\": \"$event_type\", \"message\": \"$message\", \"metadata\": $metadata}" >> "$EVENTS_LOG"
    }
fi

# Configurable monitoring event emission
emit_monitoring_event() {
    local event_type="$1"
    local message="$2"
    local metadata="${3:-{}}"
    
    case "$MONITORING_VERBOSITY" in
        "full")
            emit_task_event "$event_type" "$message" "$metadata"
            ;;
        "alerts")
            if [[ "$event_type" == "HEALTH_ALERT" || "$event_type" == "TASK_START" || "$event_type" == "TASK_END" || "$event_type" == "TASK_ERROR" ]]; then
                emit_task_event "$event_type" "$message" "$metadata"
            fi
            ;;
        "minimal")
            if [[ "$event_type" == "HEALTH_ALERT" || "$event_type" == "TASK_ERROR" ]]; then
                emit_task_event "$event_type" "$message" "$metadata"
            fi
            ;;
    esac
}

# Health alert function
send_health_alert() {
    local alert_type="$1"
    local severity="$2"
    local message="$3"
    local additional_data="${4:-{}}"
    
    local metadata=$(cat <<EOF
{
  "alertType": "$alert_type",
  "severity": "$severity",
  "component": "system_resources",
  "message": "$message",
  "recommendedAction": "Review system resource usage and optimize processes",
  "additionalData": $additional_data
}
EOF
)
    
    emit_monitoring_event "HEALTH_ALERT" "$message" "$metadata"
}

# Get CPU usage
get_cpu_usage() {
    # Get 1-minute load average and CPU count
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | awk -F',' '{print $1}' | tr -d ' ')
    local cpu_count=$(nproc)
    local cpu_percent=$(echo "scale=2; $load_avg * 100 / $cpu_count" | bc)
    
    # Get detailed CPU stats using iostat if available
    local cpu_idle=""
    if command -v iostat >/dev/null 2>&1; then
        cpu_idle=$(iostat -c 1 2 | tail -1 | awk '{print $6}')
        local cpu_used=$(echo "scale=2; 100 - $cpu_idle" | bc)
    else
        local cpu_used="$cpu_percent"
    fi
    
    echo "{\"loadAverage\": $load_avg, \"cpuCount\": $cpu_count, \"cpuPercent\": $cpu_percent, \"cpuUsed\": ${cpu_used:-$cpu_percent}}"
}

# Get memory usage
get_memory_usage() {
    local mem_info=$(free -b | grep '^Mem:')
    local total=$(echo "$mem_info" | awk '{print $2}')
    local used=$(echo "$mem_info" | awk '{print $3}')
    local available=$(echo "$mem_info" | awk '{print $7}')
    local percent_used=$(echo "scale=2; $used * 100 / $total" | bc)
    local percent_available=$(echo "scale=2; $available * 100 / $total" | bc)
    
    # Convert to human readable
    local total_gb=$(echo "scale=2; $total / 1024 / 1024 / 1024" | bc)
    local used_gb=$(echo "scale=2; $used / 1024 / 1024 / 1024" | bc)
    local available_gb=$(echo "scale=2; $available / 1024 / 1024 / 1024" | bc)
    
    echo "{\"totalBytes\": $total, \"usedBytes\": $used, \"availableBytes\": $available, \"percentUsed\": $percent_used, \"percentAvailable\": $percent_available, \"totalGB\": $total_gb, \"usedGB\": $used_gb, \"availableGB\": $available_gb}"
}

# Get disk usage
get_disk_usage() {
    local disk_info=$(df -B1 / | tail -1)
    local total=$(echo "$disk_info" | awk '{print $2}')
    local used=$(echo "$disk_info" | awk '{print $3}')
    local available=$(echo "$disk_info" | awk '{print $4}')
    local percent_used=$(echo "$disk_info" | awk '{print $5}' | tr -d '%')
    
    # Convert to human readable
    local total_gb=$(echo "scale=2; $total / 1024 / 1024 / 1024" | bc)
    local used_gb=$(echo "scale=2; $used / 1024 / 1024 / 1024" | bc)
    local available_gb=$(echo "scale=2; $available / 1024 / 1024 / 1024" | bc)
    
    # Check specific directories if they exist
    local brainstorm_disk=""
    if [[ -d "$BRAINSTORM_DATA_DIR" ]]; then
        local brainstorm_info=$(du -sb "$BRAINSTORM_DATA_DIR" 2>/dev/null | awk '{print $1}' || echo "0")
        local brainstorm_gb=$(echo "scale=2; $brainstorm_info / 1024 / 1024 / 1024" | bc)
        brainstorm_disk=", \"brainstormDataGB\": $brainstorm_gb"
    fi
    
    echo "{\"totalBytes\": $total, \"usedBytes\": $used, \"availableBytes\": $available, \"percentUsed\": $percent_used, \"totalGB\": $total_gb, \"usedGB\": $used_gb, \"availableGB\": $available_gb$brainstorm_disk}"
}

# Get network statistics
get_network_stats() {
    local interface=$(ip route | grep default | awk '{print $5}' | head -1)
    
    if [[ -n "$interface" ]] && [[ -f "/proc/net/dev" ]]; then
        local net_line=$(grep "$interface:" /proc/net/dev)
        local rx_bytes=$(echo "$net_line" | awk '{print $2}')
        local tx_bytes=$(echo "$net_line" | awk '{print $10}')
        local rx_packets=$(echo "$net_line" | awk '{print $3}')
        local tx_packets=$(echo "$net_line" | awk '{print $11}')
        
        # Convert to human readable
        local rx_gb=$(echo "scale=2; $rx_bytes / 1024 / 1024 / 1024" | bc)
        local tx_gb=$(echo "scale=2; $tx_bytes / 1024 / 1024 / 1024" | bc)
        
        echo "{\"interface\": \"$interface\", \"rxBytes\": $rx_bytes, \"txBytes\": $tx_bytes, \"rxPackets\": $rx_packets, \"txPackets\": $tx_packets, \"rxGB\": $rx_gb, \"txGB\": $tx_gb}"
    else
        echo "{\"interface\": \"unknown\", \"rxBytes\": 0, \"txBytes\": 0, \"rxPackets\": 0, \"txPackets\": 0, \"rxGB\": 0, \"txGB\": 0}"
    fi
}

# Get process information
get_process_info() {
    local total_processes=$(ps aux | wc -l)
    local brainstorm_processes=$(ps aux | grep -E "(brainstorm|neo4j|strfry)" | grep -v grep | wc -l)
    
    # Get top CPU consuming processes
    local top_cpu=$(ps aux --sort=-%cpu | head -6 | tail -5 | awk '{print $11}' | tr '\n' ',' | sed 's/,$//')
    
    # Get top memory consuming processes
    local top_mem=$(ps aux --sort=-%mem | head -6 | tail -5 | awk '{print $11}' | tr '\n' ',' | sed 's/,$//')
    
    echo "{\"totalProcesses\": $total_processes, \"brainstormProcesses\": $brainstorm_processes, \"topCpuProcesses\": \"$top_cpu\", \"topMemProcesses\": \"$top_mem\"}"
}

# Get system uptime and load
get_system_info() {
    local uptime_info=$(uptime)
    local uptime_days=$(echo "$uptime_info" | grep -o '[0-9]* day' | awk '{print $1}' || echo "0")
    local load_1min=$(echo "$uptime_info" | awk -F'load average:' '{print $2}' | awk -F',' '{print $1}' | tr -d ' ')
    local load_5min=$(echo "$uptime_info" | awk -F'load average:' '{print $2}' | awk -F',' '{print $2}' | tr -d ' ')
    local load_15min=$(echo "$uptime_info" | awk -F'load average:' '{print $2}' | awk -F',' '{print $3}' | tr -d ' ')
    
    local users=$(who | wc -l)
    
    echo "{\"uptimeDays\": $uptime_days, \"load1min\": $load_1min, \"load5min\": $load_5min, \"load15min\": $load_15min, \"activeUsers\": $users}"
}

# Monitor system resources
monitor_system_resources() {
    emit_monitoring_event "TASK_START" "Starting system resource monitoring"
    
    # Get CPU usage
    local cpu_metrics=$(get_cpu_usage)
    emit_monitoring_event "CPU_METRICS" "Retrieved CPU metrics" "$cpu_metrics"
    
    # Check CPU usage
    local cpu_percent=$(echo "$cpu_metrics" | jq -r '.cpuUsed // .cpuPercent' 2>/dev/null || echo "0")
    if (( $(echo "$cpu_percent > 90" | bc -l) )); then
        send_health_alert "SYSTEM_CPU_CRITICAL" "critical" "CPU usage critical: ${cpu_percent}%" "$cpu_metrics"
    elif (( $(echo "$cpu_percent > 80" | bc -l) )); then
        send_health_alert "SYSTEM_CPU_WARNING" "warning" "CPU usage high: ${cpu_percent}%" "$cpu_metrics"
    fi
    
    # Get memory usage
    local memory_metrics=$(get_memory_usage)
    emit_monitoring_event "MEMORY_METRICS" "Retrieved memory metrics" "$memory_metrics"
    
    # Check memory usage
    local mem_percent=$(echo "$memory_metrics" | jq -r '.percentUsed' 2>/dev/null || echo "0")
    if (( $(echo "$mem_percent > 95" | bc -l) )); then
        send_health_alert "SYSTEM_MEMORY_CRITICAL" "critical" "Memory usage critical: ${mem_percent}%" "$memory_metrics"
    elif (( $(echo "$mem_percent > 85" | bc -l) )); then
        send_health_alert "SYSTEM_MEMORY_WARNING" "warning" "Memory usage high: ${mem_percent}%" "$memory_metrics"
    fi
    
    # Get disk usage
    local disk_metrics=$(get_disk_usage)
    emit_monitoring_event "DISK_METRICS" "Retrieved disk metrics" "$disk_metrics"
    
    # Check disk usage
    local disk_percent=$(echo "$disk_metrics" | jq -r '.percentUsed' 2>/dev/null || echo "0")
    if (( disk_percent > 95 )); then
        send_health_alert "SYSTEM_DISK_CRITICAL" "critical" "Disk usage critical: ${disk_percent}%" "$disk_metrics"
    elif (( disk_percent > 85 )); then
        send_health_alert "SYSTEM_DISK_WARNING" "warning" "Disk usage high: ${disk_percent}%" "$disk_metrics"
    fi
    
    # Get network stats
    local network_metrics=$(get_network_stats)
    emit_monitoring_event "NETWORK_METRICS" "Retrieved network metrics" "$network_metrics"
    
    # Get process information
    local process_metrics=$(get_process_info)
    emit_monitoring_event "PROCESS_METRICS" "Retrieved process metrics" "$process_metrics"
    
    # Get system information
    local system_metrics=$(get_system_info)
    emit_monitoring_event "SYSTEM_METRICS" "Retrieved system information" "$system_metrics"
    
    # Check system load
    local load_1min=$(echo "$system_metrics" | jq -r '.load1min' 2>/dev/null || echo "0")
    local cpu_count=$(echo "$cpu_metrics" | jq -r '.cpuCount' 2>/dev/null || echo "1")
    local load_percent=$(echo "scale=2; $load_1min * 100 / $cpu_count" | bc)
    
    if (( $(echo "$load_percent > 200" | bc -l) )); then
        send_health_alert "SYSTEM_LOAD_CRITICAL" "critical" "System load critical: ${load_1min} (${load_percent}%)" "$system_metrics"
    elif (( $(echo "$load_percent > 150" | bc -l) )); then
        send_health_alert "SYSTEM_LOAD_WARNING" "warning" "System load high: ${load_1min} (${load_percent}%)" "$system_metrics"
    fi
    
    # Combine all metrics for final report
    local combined_metrics=$(cat <<EOF
{
  "cpu": $cpu_metrics,
  "memory": $memory_metrics,
  "disk": $disk_metrics,
  "network": $network_metrics,
  "processes": $process_metrics,
  "system": $system_metrics,
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")"
}
EOF
)
    
    emit_monitoring_event "RESOURCE_REPORT" "System resource monitoring completed" "$combined_metrics"
    emit_monitoring_event "TASK_END" "System resource monitoring completed successfully"
}

# Main execution
main() {
    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 <target>"
        echo "Example: $0 owner"
        exit 1
    fi
    
    monitor_system_resources
}

# Execute main function
main "$@"
