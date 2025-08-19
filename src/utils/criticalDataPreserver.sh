#!/bin/bash

# Critical Data Preservation System
# Extracts and preserves high-value monitoring data before log rotation
# Focuses on Neo4j Health Dashboard dependencies and crash pattern detection

# Configuration
BRAINSTORM_LOG_DIR=${BRAINSTORM_LOG_DIR:-/var/log/brainstorm}
EVENTS_FILE="${BRAINSTORM_LOG_DIR}/taskQueue/events.jsonl"
PRESERVED_DATA_DIR="${BRAINSTORM_LOG_DIR}/preserved"
HEAP_METRICS_FILE="${PRESERVED_DATA_DIR}/heap_metrics_history.jsonl"
CRASH_ALERTS_FILE="${PRESERVED_DATA_DIR}/crash_alerts_history.jsonl"
SYSTEM_METRICS_FILE="${PRESERVED_DATA_DIR}/system_metrics_history.jsonl"

# Ensure preserved data directory exists
mkdir -p "$PRESERVED_DATA_DIR"

# Extract and preserve Neo4j heap metrics from neo4jCrashPatternDetector
preserve_heap_metrics() {
    if [[ ! -f "$EVENTS_FILE" ]]; then
        return 0
    fi
    
    echo "Preserving Neo4j heap metrics data..."
    
    # Extract heap_gc_analysis events from neo4jCrashPatternDetector
    grep -E '"taskName":"neo4jCrashPatternDetector".*"target":"heap_gc_analysis"' "$EVENTS_FILE" | \
    jq -c 'select(.metadata.metrics != null)' >> "$HEAP_METRICS_FILE" 2>/dev/null
    
    # Keep only last 30 days of heap metrics (rotate preserved data too)
    if [[ -f "$HEAP_METRICS_FILE" ]]; then
        local cutoff_date=$(date -d "30 days ago" -Iseconds)
        local temp_file="${HEAP_METRICS_FILE}.tmp"
        
        jq -c "select(.timestamp >= \"$cutoff_date\")" "$HEAP_METRICS_FILE" > "$temp_file" 2>/dev/null
        mv "$temp_file" "$HEAP_METRICS_FILE"
    fi
}

# Extract and preserve crash pattern alerts and health alerts
preserve_crash_alerts() {
    if [[ ! -f "$EVENTS_FILE" ]]; then
        return 0
    fi
    
    echo "Preserving Neo4j crash pattern alerts..."
    
    # Extract HEALTH_ALERT events from neo4jCrashPatternDetector
    grep -E '"eventType":"HEALTH_ALERT".*"taskName":"neo4jCrashPatternDetector"' "$EVENTS_FILE" >> "$CRASH_ALERTS_FILE" 2>/dev/null
    
    # Also preserve critical TASK_ERROR events from Neo4j monitoring tasks
    grep -E '"eventType":"TASK_ERROR".*"taskName":"(neo4jCrashPatternDetector|neo4jStabilityMonitor|databasePerformanceMonitor)"' "$EVENTS_FILE" >> "$CRASH_ALERTS_FILE" 2>/dev/null
    
    # Keep only last 90 days of alerts
    if [[ -f "$CRASH_ALERTS_FILE" ]]; then
        local cutoff_date=$(date -d "90 days ago" -Iseconds)
        local temp_file="${CRASH_ALERTS_FILE}.tmp"
        
        jq -c "select(.timestamp >= \"$cutoff_date\")" "$CRASH_ALERTS_FILE" > "$temp_file" 2>/dev/null
        mv "$temp_file" "$CRASH_ALERTS_FILE"
    fi
}

# Extract and preserve compact task execution history
preserve_task_execution_history() {
    if [[ ! -f "$EVENTS_FILE" ]]; then
        return 0
    fi
    
    echo "Preserving task execution history..."
    
    # Extract TASK_START and TASK_END events for all tasks
    # Create compact execution records with minimal data
    grep -E '"eventType":"(TASK_START|TASK_END)"' "$EVENTS_FILE" | \
    jq -c '{
        timestamp: .timestamp,
        taskName: .taskName,
        eventType: .eventType,
        duration: (if .eventType == "TASK_END" then .metadata.duration else null end),
        exitCode: (if .eventType == "TASK_END" then .metadata.exitCode else null end),
        tier: .metadata.tier,
        priority: .metadata.priority,
        failure: (if .eventType == "TASK_END" and (.metadata.exitCode != 0 or .metadata.exitCode == null) then true else false end)
    }' >> "$SYSTEM_METRICS_FILE" 2>/dev/null
    
    # Keep only last 30 days of task execution history (compact data)
    if [[ -f "$SYSTEM_METRICS_FILE" ]]; then
        local cutoff_date=$(date -d "30 days ago" -Iseconds)
        local temp_file="${SYSTEM_METRICS_FILE}.tmp"
        
        jq -c "select(.timestamp >= \"$cutoff_date\")" "$SYSTEM_METRICS_FILE" > "$temp_file" 2>/dev/null
        mv "$temp_file" "$SYSTEM_METRICS_FILE"
    fi
}

# Create summary statistics for preserved data
create_preservation_summary() {
    local summary_file="${PRESERVED_DATA_DIR}/preservation_summary.json"
    local timestamp=$(date -Iseconds)
    
    local heap_count=$(wc -l < "$HEAP_METRICS_FILE" 2>/dev/null || echo "0")
    local alerts_count=$(wc -l < "$CRASH_ALERTS_FILE" 2>/dev/null || echo "0")
    local system_count=$(wc -l < "$SYSTEM_METRICS_FILE" 2>/dev/null || echo "0")
    
    jq -n \
        --arg timestamp "$timestamp" \
        --argjson heapMetrics "$heap_count" \
        --argjson crashAlerts "$alerts_count" \
        --argjson systemMetrics "$system_count" \
        '{
            lastPreservation: $timestamp,
            preservedCounts: {
                heapMetrics: $heapMetrics,
                crashAlerts: $crashAlerts,
                systemMetrics: $systemMetrics
            },
            dataFiles: {
                heapMetrics: "heap_metrics_history.jsonl",
                crashAlerts: "crash_alerts_history.jsonl",
                systemMetrics: "system_metrics_history.jsonl"
            }
        }' > "$summary_file"
    
    echo "Preservation summary: $heap_count heap metrics, $alerts_count alerts, $system_count task execution records"
}

# Main preservation function - called before log rotation
preserve_critical_data() {
    echo "Starting critical data preservation..."
    
    preserve_heap_metrics
    preserve_crash_alerts
    preserve_task_execution_history
    create_preservation_summary
    
    echo "Critical data preservation completed"
}

# If script is run directly, execute preservation
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    preserve_critical_data
fi
