#!/bin/bash

# Neo4j Stability Monitor
# Comprehensive Neo4j stability monitoring that orchestrates multiple detection systems
# Part of the Brainstorm Health Monitor (BHM) system

set -e
set -o pipefail

# Configuration
CONFIG_FILE="/etc/brainstorm.conf"
if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE"
fi

# Source launchChildTask function
source "$BRAINSTORM_MODULE_MANAGE_DIR/taskQueue/launchChildTask.sh"

# Find project root and source structured logging utilities
if [[ -z "$BRAINSTORM_MODULE_BASE_DIR" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(cd "$SCRIPT_DIR" && while [[ ! -f "package.json" && "$(pwd)" != "/" ]]; do cd ..; done && pwd)"
    STRUCTURED_LOGGING_UTILS="${PROJECT_ROOT}/src/utils/structuredLogging.sh"
else
    STRUCTURED_LOGGING_UTILS="${BRAINSTORM_MODULE_BASE_DIR}/src/utils/structuredLogging.sh"
fi

if [[ ! -f "$STRUCTURED_LOGGING_UTILS" ]]; then
    echo "Error: Cannot find structured logging utilities at $STRUCTURED_LOGGING_UTILS"
    exit 1
fi
source "$STRUCTURED_LOGGING_UTILS"

# Default configuration
CHECK_INTERVAL_MINUTES="${CHECK_INTERVAL_MINUTES:-15}"
NEO4J_RESTART_THRESHOLD="${NEO4J_RESTART_THRESHOLD:-3}"
NEO4J_LOG_DIR="${NEO4J_LOG_DIR:-/var/log/neo4j}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --check-interval)
            CHECK_INTERVAL_MINUTES="$2"
            shift 2
            ;;
        --restart-threshold)
            NEO4J_RESTART_THRESHOLD="$2"
            shift 2
            ;;
        --neo4j-log-dir)
            NEO4J_LOG_DIR="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --check-interval MINUTES         Check interval (default: 15)"
            echo "  --restart-threshold COUNT        Critical alerts before restart (default: 3)"
            echo "  --neo4j-log-dir DIR              Neo4j log directory (default: /var/log/neo4j)"
            echo "  --help                           Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Emit task start event
emit_task_event "TASK_START" "neo4jStabilityMonitor" "system" "$(jq -n \
    --argjson checkInterval "$CHECK_INTERVAL_MINUTES" \
    --argjson restartThreshold "$NEO4J_RESTART_THRESHOLD" \
    --arg logDir "$NEO4J_LOG_DIR" \
    '{
        "component": "neo4jStabilityMonitor",
        "monitorType": "stabilityOrchestrator",
        "checkIntervalMinutes": $checkInterval,
        "restartThreshold": $restartThreshold,
        "logDirectory": $logDir,
        "orchestratedComponents": ["crashPatternDetector", "indexHealthChecker", "connectionValidator"]
    }')"

# Function to run crash pattern detection
run_crash_pattern_detection() {
    emit_task_event "PROGRESS" "neo4jStabilityMonitor" "crash_detection" '{
        "message": "Running Neo4j crash pattern detection",
        "phase": "crash_pattern_analysis"
    }'

    launch_child_task "neo4jStabilityMonitor" "neo4jStabilityMonitor" "" ""

    emit_task_event "PROGRESS" "neo4jStabilityMonitor" "crash_detection" '{
        "message": "Neo4j crash pattern detection completed",
        "phase": "crash_pattern_analysis"
    }'
}

# Function to check Neo4j index health (addresses your APOC stalling issue)
check_index_health() {
    emit_task_event "PROGRESS" "neo4jStabilityMonitor" "index_health" '{
        "message": "Checking Neo4j index health and constraints",
        "phase": "index_health_check"
    }'
    
    # Check if Neo4j is responsive for queries
    if ! pgrep -f "neo4j" > /dev/null 2>&1; then
        emit_task_event "PROGRESS" "neo4jStabilityMonitor" "index_health" '{
            "message": "Neo4j service not running, skipping index health check",
            "phase": "index_health_check",
            "status": "service_down"
        }'
        return
    fi
    
    # Test basic connectivity and get index information
    local index_query_result=""
    local constraint_query_result=""
    local query_success=false
    
    # Try to query indexes with timeout - disable exit on error temporarily
    set +e
    timeout 30 cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "SHOW INDEXES" > /tmp/neo4j_indexes.txt 2>/dev/null
    local indexes_exit_code=$?
    set -e
    
    if [[ $indexes_exit_code -eq 0 ]]; then
        query_success=true
        local index_count=$(grep -c "ONLINE\|POPULATING\|FAILED" /tmp/neo4j_indexes.txt 2>/dev/null || echo "0")
        local failed_indexes=$(grep -c "FAILED" /tmp/neo4j_indexes.txt 2>/dev/null | tr -d '\n' || echo "0")
        
        # Check constraints - disable exit on error temporarily
        set +e
        timeout 30 cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "SHOW CONSTRAINTS" > /tmp/neo4j_constraints.txt 2>/dev/null
        local constraints_exit_code=$?
        set -e
        
        if [[ $constraints_exit_code -eq 0 ]]; then
            local constraint_count=$(wc -l < /tmp/neo4j_constraints.txt 2>/dev/null || echo "0")
            
            emit_task_event "PROGRESS" "neo4jStabilityMonitor" "index_health" "$(jq -n \
                --argjson indexCount "$index_count" \
                --argjson failedIndexes "$failed_indexes" \
                --argjson constraintCount "$constraint_count" \
                '{
                    "message": "Index and constraint health check completed",
                    "phase": "index_health_check",
                    "status": "success",
                    "metrics": {
                        "totalIndexes": $indexCount,
                        "failedIndexes": $failedIndexes,
                        "totalConstraints": $constraintCount
                    }
                }')"
            
            # Alert on failed indexes
            if [[ "$failed_indexes" -gt 0 ]]; then
                emit_stability_alert "NEO4J_FAILED_INDEXES" "critical" \
                    "Neo4j has $failed_indexes failed index(es)" \
                    "index_failure" \
                    "Run setup/neo4jConstraintsAndIndexes.sh to rebuild indexes"
            fi
            
            # Alert on missing indexes (based on your experience with APOC stalling)
            if [[ "$index_count" -lt 5 ]]; then
                emit_stability_alert "NEO4J_INSUFFICIENT_INDEXES" "warning" \
                    "Neo4j has only $index_count indexes (expected more for optimal performance)" \
                    "missing_indexes" \
                    "Ensure all necessary indexes are created to prevent query stalling"
            fi
        fi
    else
        emit_task_event "PROGRESS" "neo4jStabilityMonitor" "index_health" '{
            "message": "Failed to query Neo4j indexes - database may be unresponsive",
            "phase": "index_health_check",
            "status": "query_failed"
        }'
        
        emit_stability_alert "NEO4J_QUERY_TIMEOUT" "critical" \
            "Neo4j failed to respond to index query within 30 seconds" \
            "database_unresponsive" \
            "Check Neo4j logs and consider restart if persistent"
    fi
    
    
    # Cleanup temp files
    rm -f /tmp/neo4j_indexes.txt /tmp/neo4j_constraints.txt
}

# Function to validate Neo4j connection and performance
validate_connection_performance() {
    emit_task_event "PROGRESS" "neo4jStabilityMonitor" "connection_validation" '{
        "message": "Validating Neo4j connection and performance",
        "phase": "connection_performance_check"
    }'
    
    if ! pgrep -f "neo4j" > /dev/null 2>&1; then
        emit_stability_alert "NEO4J_SERVICE_DOWN" "critical" \
            "Neo4j service is not running" \
            "service_unavailable" \
            "Check Neo4j service status and restart if necessary"
        return
    fi
    
    # Test simple query performance
    local start_time=$(date +%s.%N)
    local query_result=""
    local query_success=false
    
    # Test simple query performance - disable exit on error temporarily
    set +e
    query_result=$(timeout 10 cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "RETURN 1 as test" 2>/dev/null)
    local query_exit_code=$?
    set -e
    
    if [[ $query_exit_code -eq 0 ]]; then
        local end_time=$(date +%s.%N)
        local response_time=$(echo "$end_time - $start_time" | bc -l 2>/dev/null || echo "0")
        local response_time_ms=$(echo "$response_time * 1000" | bc -l 2>/dev/null | cut -d. -f1 || echo "0")
        
        emit_task_event "PROGRESS" "neo4jStabilityMonitor" "connection_validation" "$(jq -n \
            --argjson responseTimeMs "$response_time_ms" \
            '{
                "message": "Neo4j connection test successful",
                "phase": "connection_performance_check",
                "status": "success",
                "metrics": {
                    "responseTimeMs": $responseTimeMs
                }
            }')"
        
        # Alert on slow response times
        if [[ "$response_time_ms" -gt 5000 ]]; then
            emit_stability_alert "NEO4J_SLOW_RESPONSE" "warning" \
                "Neo4j query response time is ${response_time_ms}ms (>5s)" \
                "performance_degradation" \
                "Check system resources and query performance"
        fi
    else
        emit_stability_alert "NEO4J_CONNECTION_FAILED" "critical" \
            "Neo4j connection test failed - service may be unresponsive" \
            "connection_failure" \
            "Check Neo4j logs and service status"
    fi
}

# Function to check for recent crashes and restarts
check_recent_crashes() {
    emit_task_event "PROGRESS" "neo4jStabilityMonitor" "crash_history" '{
        "message": "Checking for recent Neo4j crashes and restarts",
        "phase": "crash_history_analysis"
    }'
    
    local neo4j_log="${NEO4J_LOG_DIR}/neo4j.log"
    
    if [[ -f "$neo4j_log" ]]; then
        # Check for recent crashes in the last 24 hours
        local recent_crashes=$(grep -c "ERROR\|FATAL\|OutOfMemoryError\|java.lang.Exception" "$neo4j_log" 2>/dev/null || echo "0")
        local recent_starts=$(grep -c "Started\|Starting Neo4j" "$neo4j_log" 2>/dev/null || echo "0")
        
        emit_task_event "PROGRESS" "neo4jStabilityMonitor" "crash_history" "$(jq -n \
            --argjson recentCrashes "$recent_crashes" \
            --argjson recentStarts "$recent_starts" \
            '{
                "message": "Crash history analysis completed",
                "phase": "crash_history_analysis",
                "status": "success",
                "metrics": {
                    "recentErrors": $recentCrashes,
                    "recentStarts": $recentStarts
                }
            }')"
        
        # Alert on frequent restarts
        if [[ "$recent_starts" -gt 2 ]]; then
            emit_stability_alert "NEO4J_FREQUENT_RESTARTS" "warning" \
                "Neo4j has restarted $recent_starts times recently" \
                "instability_pattern" \
                "Investigate root cause of frequent restarts"
        fi
        
        # Alert on high error count
        if [[ "$recent_crashes" -gt 10 ]]; then
            emit_stability_alert "NEO4J_HIGH_ERROR_RATE" "warning" \
                "Neo4j has logged $recent_crashes errors recently" \
                "error_pattern" \
                "Review Neo4j logs for recurring issues"
        fi
    fi
}

# Function to emit stability alerts
emit_stability_alert() {
    local alert_type="$1"
    local severity="$2"
    local message="$3"
    local stability_issue="$4"
    local recommended_action="$5"
    
    local alert_metadata=$(jq -n \
        --arg alertType "$alert_type" \
        --arg severity "$severity" \
        --arg message "$message" \
        --arg component "neo4j" \
        --arg stabilityIssue "$stability_issue" \
        --arg recommendedAction "$recommended_action" \
        --arg monitor "neo4jStabilityMonitor" \
        '{
            alertType: $alertType,
            severity: $severity,
            message: $message,
            component: $component,
            stabilityIssue: $stabilityIssue,
            recommendedAction: $recommendedAction,
            monitor: $monitor,
            timestamp: now | strftime("%Y-%m-%dT%H:%M:%S%z")
        }')
    
    emit_task_event "HEALTH_ALERT" "neo4jStabilityMonitor" "stability" "$alert_metadata"
}

# Main execution
main() {
    echo "🔍 Starting comprehensive Neo4j stability monitoring..."
    
    # Run all stability checks
    run_crash_pattern_detection
    check_index_health
    validate_connection_performance
    check_recent_crashes
    
    emit_task_event "TASK_END" "neo4jStabilityMonitor" "system" '{
        "message": "Neo4j stability monitoring completed",
        "status": "success",
        "checksPerformed": ["crash_patterns", "index_health", "connection_performance", "crash_history"],
        "component": "neo4jStabilityMonitor"
    }'
    
    echo "✅ Neo4j stability monitoring completed"
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
