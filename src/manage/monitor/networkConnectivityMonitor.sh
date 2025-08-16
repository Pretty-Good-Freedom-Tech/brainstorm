#!/bin/bash

# Network Connectivity Monitor
# Monitors network connectivity to critical services and external dependencies

set -euo pipefail

# Source configuration and logging
source "$(dirname "$0")/../lib/config.js" 2>/dev/null || {
    BRAINSTORM_LOG_DIR="${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}"
    BRAINSTORM_DATA_DIR="${BRAINSTORM_DATA_DIR:-/var/lib/brainstorm}"
    BRAINSTORM_MODULE_BASE_DIR="${BRAINSTORM_MODULE_BASE_DIR:-/usr/local/lib/node_modules/brainstorm}"
}

# Set monitoring verbosity (full, alerts, minimal)
MONITORING_VERBOSITY="${BRAINSTORM_MONITORING_VERBOSITY:-alerts}"

SCRIPT_NAME="networkConnectivityMonitor"
TARGET="${1:-owner}"
LOG_FILE="${BRAINSTORM_LOG_DIR}/${SCRIPT_NAME}.log"
EVENTS_LOG="${BRAINSTORM_LOG_DIR}/taskQueue/events.jsonl"

# Ensure log directories exist
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$EVENTS_LOG")"

# Critical endpoints to monitor
CRITICAL_ENDPOINTS=(
    "8.8.8.8:53:dns"
    "1.1.1.1:53:dns"
    "github.com:443:https"
    "api.github.com:443:https"
    "registry.npmjs.org:443:https"
)

# Nostr relays to monitor (if configured)
NOSTR_RELAYS=(
    "relay.damus.io:443:wss"
    "nos.lol:443:wss"
    "relay.snort.social:443:wss"
)

# Source structured logging utilities
if [ -f "${BRAINSTORM_MODULE_BASE_DIR}/src/utils/structuredLogging.sh" ]; then
    source "${BRAINSTORM_MODULE_BASE_DIR}/src/utils/structuredLogging.sh"
else
    # Fallback emit_task_event function if structuredLogging.sh not found
    emit_task_event() {
        local event_type="$1"
        local message="$2"
        local metadata="$3"
        
        # Ensure metadata is not empty or null
        if [[ -z "$metadata" ]]; then
            metadata="{}"
        fi
        local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
        echo "{\"timestamp\": \"$timestamp\", \"taskName\": \"$SCRIPT_NAME\", \"target\": \"$TARGET\", \"eventType\": \"$event_type\", \"message\": \"$message\", \"metadata\": $metadata}" >> "$EVENTS_LOG"
    }
fi

# Configurable monitoring event emission
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
    local additional_data="$4"
    
    # Ensure additional_data is not empty or null
    if [[ -z "$additional_data" ]]; then
        additional_data="{}"
    fi
    
    local metadata=$(cat <<EOF
{
  "alertType": "$alert_type",
  "severity": "$severity",
  "component": "network_connectivity",
  "message": "$message",
  "recommendedAction": "Check network configuration and firewall settings",
  "additionalData": $additional_data
}
EOF
)
    
    emit_monitoring_event "HEALTH_ALERT" "$message" "$metadata"
}

# Test TCP connectivity
test_tcp_connection() {
    local host="$1"
    local port="$2"
    local timeout="${3:-5}"
    
    if timeout "$timeout" bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null; then
        exec 3<&-
        exec 3>&-
        return 0
    else
        return 1
    fi
}

# Test HTTP/HTTPS connectivity
test_http_connection() {
    local url="$1"
    local timeout="${2:-10}"
    
    local response_time=$(curl -o /dev/null -s -w "%{time_total}" --connect-timeout "$timeout" --max-time "$timeout" "$url" 2>/dev/null || echo "-1")
    
    if [[ "$response_time" != "-1" ]]; then
        echo "$response_time"
        return 0
    else
        echo "-1"
        return 1
    fi
}

# Test DNS resolution
test_dns_resolution() {
    local hostname="$1"
    local timeout="${2:-5}"
    
    local start_time=$(date +%s.%N)
    if timeout "$timeout" nslookup "$hostname" >/dev/null 2>&1; then
        local end_time=$(date +%s.%N)
        local response_time=$(echo "scale=3; $end_time - $start_time" | bc)
        echo "$response_time"
        return 0
    else
        echo "-1"
        return 1
    fi
}

# Get network interface information
get_network_interfaces() {
    local interfaces=()
    
    while IFS= read -r interface; do
        if [[ -n "$interface" ]] && [[ "$interface" != "lo" ]]; then
            local status="down"
            local ip=""
            
            if ip link show "$interface" | grep -q "state UP"; then
                status="up"
                ip=$(ip addr show "$interface" | grep -o 'inet [0-9.]*' | awk '{print $2}' | head -1)
            fi
            
            interfaces+=("{\"interface\": \"$interface\", \"status\": \"$status\", \"ip\": \"${ip:-none}\"}")
        fi
    done < <(ip link show | grep -E '^[0-9]+:' | awk -F': ' '{print $2}' | awk '{print $1}')
    
    local interfaces_json=$(IFS=','; echo "[${interfaces[*]}]")
    echo "$interfaces_json"
}

# Test endpoint connectivity
test_endpoint() {
    local endpoint="$1"
    local host=$(echo "$endpoint" | cut -d':' -f1)
    local port=$(echo "$endpoint" | cut -d':' -f2)
    local protocol=$(echo "$endpoint" | cut -d':' -f3)
    
    local result="{\"endpoint\": \"$endpoint\", \"host\": \"$host\", \"port\": $port, \"protocol\": \"$protocol\""
    
    case "$protocol" in
        "dns")
            local dns_time=$(test_dns_resolution "$host")
            if [[ "$dns_time" != "-1" ]]; then
                result+=", \"status\": \"up\", \"responseTime\": $dns_time"
            else
                result+=", \"status\": \"down\", \"responseTime\": -1"
            fi
            ;;
        "https"|"http")
            local url_scheme="$protocol"
            local http_time=$(test_http_connection "${url_scheme}://${host}" 10)
            if [[ "$http_time" != "-1" ]]; then
                result+=", \"status\": \"up\", \"responseTime\": $http_time"
            else
                result+=", \"status\": \"down\", \"responseTime\": -1"
            fi
            ;;
        "wss"|"ws")
            # For WebSocket, test basic TCP connectivity first
            if test_tcp_connection "$host" "$port" 5; then
                result+=", \"status\": \"up\", \"responseTime\": 0.1"
            else
                result+=", \"status\": \"down\", \"responseTime\": -1"
            fi
            ;;
        *)
            # Default TCP test
            if test_tcp_connection "$host" "$port" 5; then
                result+=", \"status\": \"up\", \"responseTime\": 0.1"
            else
                result+=", \"status\": \"down\", \"responseTime\": -1"
            fi
            ;;
    esac
    
    result+="}"
    echo "$result"
}

# Monitor network connectivity
monitor_network_connectivity() {
    emit_monitoring_event "TASK_START" "Starting network connectivity monitoring"
    
    # Get network interface information
    local interfaces=$(get_network_interfaces)
    emit_monitoring_event "NETWORK_INTERFACES" "Retrieved network interface information" "$interfaces"
    
    # Check if any interfaces are up
    local active_interfaces=$(echo "$interfaces" | jq '[.[] | select(.status == "up")] | length' 2>/dev/null || echo "0")
    if [[ "$active_interfaces" -eq 0 ]]; then
        send_health_alert "NETWORK_NO_INTERFACES" "critical" "No active network interfaces found" "$interfaces"
        emit_monitoring_event "TASK_ERROR" "No active network interfaces"
        return 1
    fi
    
    # Test critical endpoints
    local endpoint_results=()
    local failed_endpoints=0
    local total_endpoints=0
    
    for endpoint in "${CRITICAL_ENDPOINTS[@]}"; do
        local result=$(test_endpoint "$endpoint")
        endpoint_results+=("$result")
        total_endpoints=$((total_endpoints + 1))
        
        local status=$(echo "$result" | jq -r '.status' 2>/dev/null || echo "unknown")
        if [[ "$status" == "down" ]]; then
            failed_endpoints=$((failed_endpoints + 1))
            local host=$(echo "$result" | jq -r '.host' 2>/dev/null || echo "unknown")
            send_health_alert "NETWORK_ENDPOINT_DOWN" "warning" "Critical endpoint unreachable: $host" "$result"
        fi
    done
    
    # Test Nostr relays if available
    local nostr_results=()
    local failed_nostr=0
    local total_nostr=0
    
    for relay in "${NOSTR_RELAYS[@]}"; do
        local result=$(test_endpoint "$relay")
        nostr_results+=("$result")
        total_nostr=$((total_nostr + 1))
        
        local status=$(echo "$result" | jq -r '.status' 2>/dev/null || echo "unknown")
        if [[ "$status" == "down" ]]; then
            failed_nostr=$((failed_nostr + 1))
        fi
    done
    
    # Calculate connectivity health
    local critical_success_rate=0
    if [[ $total_endpoints -gt 0 ]]; then
        critical_success_rate=$(echo "scale=2; ($total_endpoints - $failed_endpoints) * 100 / $total_endpoints" | bc)
    fi
    
    local nostr_success_rate=0
    if [[ $total_nostr -gt 0 ]]; then
        nostr_success_rate=$(echo "scale=2; ($total_nostr - $failed_nostr) * 100 / $total_nostr" | bc)
    fi
    
    # Send alerts based on connectivity health
    if [[ $failed_endpoints -gt 0 ]]; then
        if (( $(echo "$critical_success_rate < 50" | bc -l) )); then
            send_health_alert "NETWORK_CONNECTIVITY_CRITICAL" "critical" "Critical network connectivity failure: ${critical_success_rate}% success rate" "{\"successRate\": $critical_success_rate, \"failedEndpoints\": $failed_endpoints}"
        elif (( $(echo "$critical_success_rate < 80" | bc -l) )); then
            send_health_alert "NETWORK_CONNECTIVITY_WARNING" "warning" "Network connectivity degraded: ${critical_success_rate}% success rate" "{\"successRate\": $critical_success_rate, \"failedEndpoints\": $failed_endpoints}"
        fi
    fi
    
    # Test internet connectivity with ping
    local ping_results=()
    for target in "8.8.8.8" "1.1.1.1"; do
        local ping_time=$(ping -c 1 -W 5 "$target" 2>/dev/null | grep 'time=' | awk -F'time=' '{print $2}' | awk '{print $1}' || echo "-1")
        ping_results+=("{\"target\": \"$target\", \"responseTime\": \"$ping_time\"}")
    done
    
    local ping_json=$(IFS=','; echo "[${ping_results[*]}]")
    emit_monitoring_event "PING_RESULTS" "Internet connectivity test completed" "$ping_json"
    
    # Combine all results
    local endpoint_json=$(IFS=','; echo "[${endpoint_results[*]}]")
    local nostr_json=$(IFS=','; echo "[${nostr_results[*]}]")
    
    local combined_results=$(cat <<EOF
{
  "interfaces": $interfaces,
  "criticalEndpoints": $endpoint_json,
  "nostrRelays": $nostr_json,
  "pingResults": $ping_json,
  "summary": {
    "activeInterfaces": $active_interfaces,
    "criticalSuccessRate": $critical_success_rate,
    "nostrSuccessRate": $nostr_success_rate,
    "failedCritical": $failed_endpoints,
    "failedNostr": $failed_nostr,
    "totalCritical": $total_endpoints,
    "totalNostr": $total_nostr
  },
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")"
}
EOF
)
    
    emit_monitoring_event "CONNECTIVITY_REPORT" "Network connectivity monitoring completed" "$combined_results"
    emit_monitoring_event "TASK_END" "Network connectivity monitoring completed successfully"
}

# Main execution
main() {
    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 <target>"
        echo "Example: $0 owner"
        exit 1
    fi
    
    monitor_network_connectivity
}

# Execute main function
main "$@"
