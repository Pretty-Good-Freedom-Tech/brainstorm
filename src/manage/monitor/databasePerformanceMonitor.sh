#!/bin/bash

# Database Performance Monitor
# Monitors Neo4j database performance metrics and detects performance degradation

set -euo pipefail

# Source configuration and logging
# Try to source Brainstorm configuration
if [ -f "/etc/brainstorm/brainstorm.conf" ]; then
    source "/etc/brainstorm/brainstorm.conf"
elif [ -f "${BRAINSTORM_MODULE_BASE_DIR:-/usr/local/lib/node_modules/brainstorm}/config/brainstorm.conf" ]; then
    source "${BRAINSTORM_MODULE_BASE_DIR:-/usr/local/lib/node_modules/brainstorm}/config/brainstorm.conf"
fi

# Set default values if not already set
BRAINSTORM_LOG_DIR="${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}"
BRAINSTORM_DATA_DIR="${BRAINSTORM_DATA_DIR:-/var/lib/brainstorm}"
BRAINSTORM_MODULE_BASE_DIR="${BRAINSTORM_MODULE_BASE_DIR:-/usr/local/lib/node_modules/brainstorm}"

# Set default Neo4j configuration if not already set
NEO4J_URI="${NEO4J_URI:-bolt://localhost:7687}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-neo4j}"

# Set monitoring verbosity (full, alerts, minimal)
MONITORING_VERBOSITY="${BRAINSTORM_MONITORING_VERBOSITY:-alerts}"

SCRIPT_NAME="databasePerformanceMonitor"
TARGET="${1:-owner}"
LOG_FILE="${BRAINSTORM_LOG_DIR}/${SCRIPT_NAME}.log"
EVENTS_LOG="${BRAINSTORM_LOG_DIR}/taskQueue/events.jsonl"

# Ensure log directories exist
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$(dirname "$EVENTS_LOG")"

# Source structured logging utilities
if [ -f "${BRAINSTORM_MODULE_BASE_DIR}/src/utils/structuredLogging.sh" ]; then
    source "${BRAINSTORM_MODULE_BASE_DIR}/src/utils/structuredLogging.sh"
else
    # Fallback emit_task_event function if structuredLogging.sh not found
    emit_task_event() {
        local event_type="$1"
        local message="$2"
        local metadata="${3:-}"
        
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
    local additional_data="${4:-}"
    
    # Ensure additional_data is not empty or null
    if [[ -z "$additional_data" ]]; then
        additional_data="{}"
    fi
    
    local metadata=$(cat <<EOF
{
  "alertType": "$alert_type",
  "severity": "$severity",
  "component": "database_performance",
  "message": "$message",
  "recommendedAction": "Review database performance metrics and optimize queries",
  "additionalData": $additional_data
}
EOF
)
    
    emit_monitoring_event "HEALTH_ALERT" "$message" "$metadata"
}

# Get Neo4j process information
get_neo4j_pid() {
    pgrep -f "neo4j" | head -1 || echo ""
}

# Check Neo4j connection
check_neo4j_connection() {
    local timeout=10
    local response_time_file=$(mktemp)
    
    if timeout $timeout bash -c "
        start_time=\$(date +%s.%N)
        cypher-shell -u neo4j -p \"$NEO4J_PASSWORD\" 'RETURN 1 as test;' > /dev/null 2>&1
        end_time=\$(date +%s.%N)
        echo \"scale=3; \$end_time - \$start_time\" | bc > '$response_time_file'
    "; then
        local response_time=$(cat "$response_time_file" 2>/dev/null || echo "0")
        rm -f "$response_time_file"
        echo "$response_time"
        return 0
    else
        rm -f "$response_time_file"
        echo "-1"
        return 1
    fi
}

# Get database metrics
get_database_metrics() {
    local metrics_file=$(mktemp)
    
    if cypher-shell -u neo4j -p "$NEO4J_PASSWORD" --format plain "
        CALL dbms.queryJmx('java.lang:type=Memory') YIELD attributes
        WITH attributes.HeapMemoryUsage.value as heap
        RETURN 
            heap.used as heapUsed,
            heap.max as heapMax,
            heap.committed as heapCommitted;
    " 2>/dev/null > "$metrics_file"; then
        
        # Parse the output
        local heap_used=$(tail -n 1 "$metrics_file" | cut -d'|' -f1 | tr -d ' ')
        local heap_max=$(tail -n 1 "$metrics_file" | cut -d'|' -f2 | tr -d ' ')
        local heap_committed=$(tail -n 1 "$metrics_file" | cut -d'|' -f3 | tr -d ' ')
        
        rm -f "$metrics_file"
        
        if [[ "$heap_used" =~ ^[0-9]+$ ]] && [[ "$heap_max" =~ ^[0-9]+$ ]]; then
            local heap_utilization=$(echo "scale=2; $heap_used * 100 / $heap_max" | bc)
            echo "{\"heapUsed\": $heap_used, \"heapMax\": $heap_max, \"heapCommitted\": $heap_committed, \"heapUtilization\": $heap_utilization}"
        else
            echo "{\"error\": \"Failed to parse heap metrics\"}"
        fi
    else
        rm -f "$metrics_file"
        echo "{\"error\": \"Failed to query database metrics\"}"
    fi
}

# Get query performance metrics
get_query_performance() {
    local query_file=$(mktemp)
    
    if cypher-shell -u neo4j -p "$NEO4J_PASSWORD" --format plain "
        CALL dbms.listQueries() YIELD query, elapsedTimeMillis, status
        WHERE elapsedTimeMillis > 5000
        RETURN count(*) as longRunningQueries, avg(elapsedTimeMillis) as avgElapsedTime;
    " 2>/dev/null > "$query_file"; then
        
        local long_queries=$(tail -n 1 "$query_file" | cut -d'|' -f1 | tr -d ' ')
        local avg_time=$(tail -n 1 "$query_file" | cut -d'|' -f2 | tr -d ' ')
        
        rm -f "$query_file"
        
        if [[ "$long_queries" =~ ^[0-9]+$ ]]; then
            echo "{\"longRunningQueries\": $long_queries, \"avgElapsedTime\": ${avg_time:-0}}"
        else
            echo "{\"longRunningQueries\": 0, \"avgElapsedTime\": 0}"
        fi
    else
        rm -f "$query_file"
        echo "{\"longRunningQueries\": 0, \"avgElapsedTime\": 0}"
    fi
}

# Get transaction metrics
get_transaction_metrics() {
    local tx_file=$(mktemp)
    
    if cypher-shell -u neo4j -p "$NEO4J_PASSWORD" --format plain "
        CALL dbms.listTransactions() YIELD transactionId, elapsedTimeMillis, status
        RETURN count(*) as activeTransactions, 
               sum(CASE WHEN elapsedTimeMillis > 30000 THEN 1 ELSE 0 END) as longTransactions;
    " 2>/dev/null > "$tx_file"; then
        
        local active_tx=$(tail -n 1 "$tx_file" | cut -d'|' -f1 | tr -d ' ')
        local long_tx=$(tail -n 1 "$tx_file" | cut -d'|' -f2 | tr -d ' ')
        
        rm -f "$tx_file"
        
        echo "{\"activeTransactions\": ${active_tx:-0}, \"longTransactions\": ${long_tx:-0}}"
    else
        rm -f "$tx_file"
        echo "{\"activeTransactions\": 0, \"longTransactions\": 0}"
    fi
}

# Monitor database performance
monitor_database_performance() {
    emit_monitoring_event "TASK_START" "Starting database performance monitoring"
    
    # Get Neo4j PID
    local neo4j_pid=$(get_neo4j_pid)
    if [[ -z "$neo4j_pid" ]]; then
        send_health_alert "NEO4J_PROCESS_NOT_FOUND" "critical" "Neo4j process not found"
        emit_monitoring_event "TASK_ERROR" "Neo4j process not found"
        return 1
    fi
    
    emit_monitoring_event "PROCESS_FOUND" "Neo4j process found" "{\"pid\": $neo4j_pid}"
    
    # Check connection and response time
    local response_time=$(check_neo4j_connection)
    if [[ "$response_time" == "-1" ]]; then
        send_health_alert "NEO4J_CONNECTION_FAILED" "critical" "Failed to connect to Neo4j database"
        emit_monitoring_event "TASK_ERROR" "Database connection failed"
        return 1
    fi
    
    # Alert on slow response times
    if (( $(echo "$response_time > 5.0" | bc -l) )); then
        send_health_alert "NEO4J_SLOW_RESPONSE" "warning" "Database response time is slow: ${response_time}s" "{\"responseTime\": $response_time}"
    fi
    
    emit_monitoring_event "CONNECTION_CHECK" "Database connection successful" "{\"responseTime\": $response_time}"
    
    # Get database metrics
    local db_metrics=$(get_database_metrics)
    emit_monitoring_event "DATABASE_METRICS" "Retrieved database metrics" "$db_metrics"
    
    # Check heap utilization
    local heap_util=$(echo "$db_metrics" | jq -r '.heapUtilization // 0' 2>/dev/null || echo "0")
    if (( $(echo "$heap_util > 90" | bc -l) )); then
        send_health_alert "NEO4J_HEAP_CRITICAL" "critical" "Heap utilization critical: ${heap_util}%" "{\"heapUtilization\": $heap_util}"
    elif (( $(echo "$heap_util > 80" | bc -l) )); then
        send_health_alert "NEO4J_HEAP_WARNING" "warning" "Heap utilization high: ${heap_util}%" "{\"heapUtilization\": $heap_util}"
    fi
    
    # Get query performance metrics
    local query_metrics=$(get_query_performance)
    emit_monitoring_event "QUERY_METRICS" "Retrieved query performance metrics" "$query_metrics"
    
    # Check for long-running queries
    local long_queries=$(echo "$query_metrics" | jq -r '.longRunningQueries // 0' 2>/dev/null || echo "0")
    if [[ "$long_queries" -gt 5 ]]; then
        send_health_alert "NEO4J_SLOW_QUERIES" "warning" "Multiple long-running queries detected: $long_queries" "$query_metrics"
    fi
    
    # Get transaction metrics
    local tx_metrics=$(get_transaction_metrics)
    emit_monitoring_event "TRANSACTION_METRICS" "Retrieved transaction metrics" "$tx_metrics"
    
    # Check for long transactions
    local long_tx=$(echo "$tx_metrics" | jq -r '.longTransactions // 0' 2>/dev/null || echo "0")
    if [[ "$long_tx" -gt 0 ]]; then
        send_health_alert "NEO4J_LONG_TRANSACTIONS" "warning" "Long-running transactions detected: $long_tx" "$tx_metrics"
    fi
    
    # Combine all metrics for final report
    local combined_metrics=$(cat <<EOF
{
  "neo4jPid": $neo4j_pid,
  "responseTime": $response_time,
  "database": $db_metrics,
  "queries": $query_metrics,
  "transactions": $tx_metrics,
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")"
}
EOF
)
    
    emit_monitoring_event "PERFORMANCE_REPORT" "Database performance monitoring completed" "$combined_metrics"
    emit_monitoring_event "TASK_END" "Database performance monitoring completed successfully"
}

# Main execution
main() {
    if [[ $# -eq 0 ]]; then
        echo "Usage: $0 <target>"
        echo "Example: $0 owner"
        exit 1
    fi
    
    # Validate Neo4j password is set
    if [[ -z "${NEO4J_PASSWORD:-}" ]]; then
        emit_monitoring_event "TASK_ERROR" "NEO4J_PASSWORD environment variable not set"
        exit 1
    fi
    
    monitor_database_performance
}

# Execute main function
main "$@"
