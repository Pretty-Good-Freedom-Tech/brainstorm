#!/bin/bash

# Neo4j Crash Pattern Detector
# Enhanced monitoring for Neo4j stability issues based on common crash patterns
# Part of the Brainstorm Health Monitor (BHM) system

set -e
set -o pipefail

# Configuration
CONFIG_FILE="/etc/brainstorm.conf"
if [[ -f "$CONFIG_FILE" ]]; then
    source "$CONFIG_FILE"
fi

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
NEO4J_LOG_DIR="${NEO4J_LOG_DIR:-/var/log/neo4j}"
NEO4J_HEAP_WARNING_THRESHOLD="${NEO4J_HEAP_WARNING_THRESHOLD:-80}"
NEO4J_HEAP_CRITICAL_THRESHOLD="${NEO4J_HEAP_CRITICAL_THRESHOLD:-95}"
NEO4J_GC_OVERHEAD_THRESHOLD="${NEO4J_GC_OVERHEAD_THRESHOLD:-98}"
NEO4J_FULL_GC_FREQUENCY_THRESHOLD="${NEO4J_FULL_GC_FREQUENCY_THRESHOLD:-10}"
NEO4J_RESPONSE_TIME_THRESHOLD="${NEO4J_RESPONSE_TIME_THRESHOLD:-30}"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --neo4j-log-dir)
            NEO4J_LOG_DIR="$2"
            shift 2
            ;;
        --heap-warning-threshold)
            NEO4J_HEAP_WARNING_THRESHOLD="$2"
            shift 2
            ;;
        --heap-critical-threshold)
            NEO4J_HEAP_CRITICAL_THRESHOLD="$2"
            shift 2
            ;;
        --gc-overhead-threshold)
            NEO4J_GC_OVERHEAD_THRESHOLD="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --neo4j-log-dir DIR              Neo4j log directory (default: /var/log/neo4j)"
            echo "  --heap-warning-threshold PCT     Heap warning threshold % (default: 80)"
            echo "  --heap-critical-threshold PCT    Heap critical threshold % (default: 95)"
            echo "  --gc-overhead-threshold PCT      GC overhead threshold % (default: 98)"
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
emit_task_event "TASK_START" "neo4jCrashPatternDetector" "system" "$(jq -n \
    --arg logDir "$NEO4J_LOG_DIR" \
    --argjson heapWarning "$NEO4J_HEAP_WARNING_THRESHOLD" \
    --argjson heapCritical "$NEO4J_HEAP_CRITICAL_THRESHOLD" \
    --argjson gcOverhead "$NEO4J_GC_OVERHEAD_THRESHOLD" \
    '{
        "component": "neo4jCrashPatternDetector",
        "monitorType": "crashPatternDetection",
        "logDirectory": $logDir,
        "thresholds": {
            "heapWarningPercent": $heapWarning,
            "heapCriticalPercent": $heapCritical,
            "gcOverheadPercent": $gcOverhead
        }
    }')"

# Function to check for OutOfMemoryError patterns in logs
check_oom_patterns() {
    emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "oom_detection" '{
        "message": "Scanning Neo4j logs for OutOfMemoryError patterns",
        "phase": "oom_pattern_detection"
    }'
    
    local neo4j_log="${NEO4J_LOG_DIR}/neo4j.log"
    local debug_log="${NEO4J_LOG_DIR}/debug.log"
    
    # Check for various OOM patterns in the last 24 hours
    local cutoff_time=$(date -d '24 hours ago' '+%Y-%m-%d')
    
    # Pattern 1: Java heap space errors
    if [[ -f "$neo4j_log" ]]; then
        local heap_errors=$(grep -c "java.lang.OutOfMemoryError: Java heap space" "$neo4j_log" 2>/dev/null | tr -d '\n' || echo "0")
        if [[ "$heap_errors" -gt 0 ]]; then
            emit_crash_alert "HEAP_SPACE_OOM" "critical" \
                "Detected $heap_errors Java heap space OutOfMemoryError(s) in Neo4j logs" \
                "heap_space_exhaustion" \
                "Increase heap size in neo4j.conf: dbms.memory.heap.max_size"
        fi
    fi
    
    # Pattern 2: GC overhead limit exceeded
    if [[ -f "$debug_log" ]]; then
        local gc_overhead_errors=$(grep -c "java.lang.OutOfMemoryError: GC overhead limit exceeded" "$debug_log" 2>/dev/null | tr -d '\n' || echo "0")
        if [[ "$gc_overhead_errors" -gt 0 ]]; then
            emit_crash_alert "GC_OVERHEAD_OOM" "critical" \
                "Detected $gc_overhead_errors GC overhead limit exceeded error(s)" \
                "gc_thrashing" \
                "JVM spending >98% time in GC. Increase heap or optimize queries"
        fi
    fi
    
    # Pattern 3: Metaspace errors
    if [[ -f "$neo4j_log" ]]; then
        local metaspace_errors=$(grep -c "java.lang.OutOfMemoryError: Metaspace\|java.lang.OutOfMemoryError: Compressed class space" "$neo4j_log" 2>/dev/null | tr -d '\n' || echo "0")
        if [[ "$metaspace_errors" -gt 0 ]]; then
            emit_crash_alert "METASPACE_OOM" "warning" \
                "Detected $metaspace_errors Metaspace/Compressed class space error(s)" \
                "metaspace_exhaustion" \
                "Too many classes loaded. Check for class loader leaks"
        fi
    fi
    
    # Pattern 4: Native thread creation failures
    if [[ -f "$neo4j_log" ]]; then
        local thread_errors=$(grep -c "java.lang.OutOfMemoryError: Unable to create new native thread" "$neo4j_log" 2>/dev/null | tr -d '\n' || echo "0")
        if [[ "$thread_errors" -gt 0 ]]; then
            emit_crash_alert "NATIVE_THREAD_OOM" "critical" \
                "Detected $thread_errors native thread creation failure(s)" \
                "thread_exhaustion" \
                "OS thread limit reached. Check ulimits and concurrent connections"
        fi
    fi
}

# Function to analyze current heap and GC metrics
check_heap_and_gc_health() {
    emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" '{
        "message": "Analyzing current Neo4j heap and GC metrics",
        "phase": "heap_gc_health_check"
    }'
    
    local neo4j_pid=$(pgrep -f "neo4j" | head -1)
    if [[ -z "$neo4j_pid" ]]; then
        emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" '{
            "message": "Neo4j process not found, skipping heap analysis",
            "phase": "heap_gc_health_check"
        }'
        return
    fi
    
    # Get detailed heap and GC information from enhanced metrics collector or fallback to direct jstat
    local heap_percent=0
    local heap_used=0
    local heap_total=0
    local young_gc_count=0
    local young_gc_time=0
    local full_gc_count=0
    local full_gc_time=0
    local metrics_source="unavailable"
    
    # Method 1: Try enhanced metrics from dedicated collector
    local metrics_file="/var/lib/brainstorm/monitoring/neo4j_metrics.json"
    if [[ -f "$metrics_file" && -r "$metrics_file" ]]; then
        local metrics_age=$(stat -c %Y "$metrics_file" 2>/dev/null || echo "0")
        local current_time=$(date +%s)
        local age_diff=$((current_time - metrics_age))
        
        emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" "$(jq -n \
            --arg file "$metrics_file" \
            --argjson age "$age_diff" \
            '{
                "message": "Checking enhanced metrics file",
                "phase": "metrics_collection_debug",
                "debug": {
                    "metricsFile": $file,
                    "ageSeconds": $age,
                    "ageThreshold": 120
                }
            }')"
        
        # Use metrics if they're less than 2 minutes old
        if [[ $age_diff -lt 120 ]]; then
            local heap_data=$(jq -r '.heap // empty' "$metrics_file" 2>/dev/null)
            local gc_data=$(jq -r '.gc // empty' "$metrics_file" 2>/dev/null)
            
            emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" "$(jq -n \
                --arg heapData "$heap_data" \
                --arg gcData "$gc_data" \
                '{
                    "message": "Parsed enhanced metrics data",
                    "phase": "metrics_collection_debug",
                    "debug": {
                        "heapDataPresent": ($heapData != "empty" and $heapData != "null" and $heapData != ""),
                        "gcDataPresent": ($gcData != "empty" and $gcData != "null" and $gcData != "")
                    }
                }')"
            
            if [[ -n "$heap_data" && "$heap_data" != "null" && "$heap_data" != "empty" ]]; then
                heap_used=$(echo "$heap_data" | jq -r '.usedBytes')
                heap_total=$(echo "$heap_data" | jq -r '.totalBytes')
                heap_percent=$(echo "$heap_data" | jq -r '.percentUsed' | awk '{printf "%.0f", $1}')
                metrics_source="enhanced_collector"
            fi
            
            if [[ -n "$gc_data" && "$gc_data" != "null" && "$gc_data" != "empty" ]]; then
                young_gc_count=$(echo "$gc_data" | jq -r '.youngGC')
                young_gc_time=$(echo "$gc_data" | jq -r '.youngGCTime')
                full_gc_count=$(echo "$gc_data" | jq -r '.fullGC')
                full_gc_time=$(echo "$gc_data" | jq -r '.fullGCTime')
            fi
        fi
    else
        emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" "$(jq -n \
            --arg file "$metrics_file" \
            --argjson exists "$(test -f "$metrics_file" && echo true || echo false)" \
            --argjson readable "$(test -r "$metrics_file" && echo true || echo false)" \
            '{
                "message": "Enhanced metrics file not available",
                "phase": "metrics_collection_debug",
                "debug": {
                    "metricsFile": $file,
                    "exists": $exists,
                    "readable": $readable
                }
            }')"
    fi
    
    # Method 2: Fallback to direct jstat if enhanced metrics unavailable
    if [[ "$metrics_source" == "unavailable" && -n "$neo4j_pid" ]]; then
        emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" "$(jq -n \
            --argjson pid "$neo4j_pid" \
            --argjson jstatAvailable "$(command -v jstat >/dev/null 2>&1 && echo true || echo false)" \
            '{
                "message": "Attempting jstat fallback method",
                "phase": "metrics_collection_debug",
                "debug": {
                    "neo4jPid": $pid,
                    "jstatAvailable": $jstatAvailable
                }
            }')"
        
        if command -v jstat >/dev/null 2>&1; then
            local heap_info=$(jstat -gc "$neo4j_pid" 2>/dev/null || echo "")
            
            emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" "$(jq -n \
                --argjson hasHeapInfo "$(test -n "$heap_info" && echo true || echo false)" \
                '{
                    "message": "jstat command executed",
                    "phase": "metrics_collection_debug",
                    "debug": {
                        "heapInfoRetrieved": $hasHeapInfo
                    }
                }')"
            
            if [[ -n "$heap_info" ]]; then
                # Parse heap utilization
                local heap_data=$(echo "$heap_info" | tail -1)
                heap_used=$(echo "$heap_data" | awk '{print ($3 + $4 + $6 + $8) * 1024}')
                heap_total=$(echo "$heap_data" | awk '{print ($1 + $2 + $5 + $7) * 1024}')
                
                if [[ "$heap_total" -gt 0 ]]; then
                    heap_percent=$(echo "$heap_used $heap_total" | awk '{printf "%.0f", ($1 * 100) / $2}')
                fi
                
                # Parse GC metrics
                young_gc_count=$(echo "$heap_data" | awk '{print $12}')
                young_gc_time=$(echo "$heap_data" | awk '{print $13}')
                full_gc_count=$(echo "$heap_data" | awk '{print $14}')
                full_gc_time=$(echo "$heap_data" | awk '{print $15}')
                metrics_source="direct_jstat"
                
                emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" "$(jq -n \
                    --argjson heapUsed "$heap_used" \
                    --argjson heapTotal "$heap_total" \
                    --argjson heapPercent "$heap_percent" \
                    '{
                        "message": "jstat metrics parsed successfully",
                        "phase": "metrics_collection_debug",
                        "debug": {
                            "heapUsedBytes": $heapUsed,
                            "heapTotalBytes": $heapTotal,
                            "heapPercent": $heapPercent,
                            "metricsSource": "direct_jstat"
                        }
                    }')"
            fi
        fi
    fi
    
    # Only proceed with analysis if we have valid metrics
    if [[ "$metrics_source" != "unavailable" ]]; then
        # Calculate GC overhead (time spent in GC)
        local total_gc_time=$(echo "$young_gc_time $full_gc_time" | awk '{print $1 + $2}')
        local gc_overhead_percent=0
        
        # Estimate runtime (this is approximate)
        local uptime_seconds=$(ps -o etime= -p "$neo4j_pid" 2>/dev/null | awk -F: '{if(NF==3) print $1*3600+$2*60+$3; else if(NF==2) print $1*60+$2; else print $1}' || echo "0")
        if [[ "$uptime_seconds" -gt 0 ]]; then
            gc_overhead_percent=$(echo "$total_gc_time $uptime_seconds" | awk '{printf "%.1f", ($1 * 100) / $2}')
        fi
        
        # Emit detailed metrics with source information
        emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" "$(jq -n \
            --argjson heapPercent "$heap_percent" \
            --argjson heapUsedMB "$(echo "$heap_used" | awk '{printf "%.0f", $1/1024/1024}')" \
            --argjson heapTotalMB "$(echo "$heap_total" | awk '{printf "%.0f", $1/1024/1024}')" \
            --argjson youngGcCount "$young_gc_count" \
            --arg youngGcTime "$young_gc_time" \
            --argjson fullGcCount "$full_gc_count" \
            --arg fullGcTime "$full_gc_time" \
            --arg gcOverheadPercent "$gc_overhead_percent" \
            --arg metricsSource "$metrics_source" \
            '{
                "message": "Current heap and GC metrics analyzed",
                    "phase": "heap_gc_health_check",
                    "metrics": {
                        "heapUtilizationPercent": $heapPercent,
                        "heapUsedMB": $heapUsedMB,
                        "heapTotalMB": $heapTotalMB,
                        "youngGcCount": $youngGcCount,
                        "youngGcTimeSeconds": $youngGcTime,
                        "fullGcCount": $fullGcCount,
                        "fullGcTimeSeconds": $fullGcTime,
                        "gcOverheadPercent": $gcOverheadPercent
                    }
                }')"
            
            # Generate alerts based on thresholds
            if [[ "$heap_percent" -ge "$NEO4J_HEAP_CRITICAL_THRESHOLD" ]]; then
                emit_crash_alert "NEO4J_HEAP_CRITICAL" "critical" \
                    "Neo4j heap utilization at ${heap_percent}% (critical threshold: ${NEO4J_HEAP_CRITICAL_THRESHOLD}%)" \
                    "heap_near_exhaustion" \
                    "Immediate action required: increase heap size or reduce memory usage"
            elif [[ "$heap_percent" -ge "$NEO4J_HEAP_WARNING_THRESHOLD" ]]; then
                emit_crash_alert "NEO4J_HEAP_WARNING" "warning" \
                    "Neo4j heap utilization at ${heap_percent}% (warning threshold: ${NEO4J_HEAP_WARNING_THRESHOLD}%)" \
                    "heap_high_utilization" \
                    "Monitor closely, consider heap tuning or query optimization"
            fi
            
            # Check for excessive GC overhead
            local gc_overhead_int=$(echo "$gc_overhead_percent" | awk '{printf "%.0f", $1}')
            if [[ "$gc_overhead_int" -ge "$NEO4J_GC_OVERHEAD_THRESHOLD" ]]; then
                emit_crash_alert "NEO4J_GC_THRASHING" "critical" \
                    "Neo4j GC overhead at ${gc_overhead_percent}% (threshold: ${NEO4J_GC_OVERHEAD_THRESHOLD}%)" \
                    "gc_thrashing" \
                    "JVM spending too much time in garbage collection. Increase heap or optimize queries"
            fi
            
            # Check for excessive full GC frequency
            if [[ "$full_gc_count" -gt "$NEO4J_FULL_GC_FREQUENCY_THRESHOLD" ]]; then
                emit_crash_alert "NEO4J_EXCESSIVE_FULL_GC" "warning" \
                    "Neo4j has performed $full_gc_count full GC cycles (threshold: $NEO4J_FULL_GC_FREQUENCY_THRESHOLD)" \
                    "frequent_full_gc" \
                    "Frequent full GCs indicate memory pressure. Consider heap tuning"
            fi
        fi
}

# Function to check for APOC-related stalling patterns
check_apoc_stalling_patterns() {
    emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "apoc_stalling" '{
        "message": "Checking for APOC procedure stalling patterns",
        "phase": "apoc_stalling_detection"
    }'
    
    local neo4j_log="${NEO4J_LOG_DIR}/neo4j.log"
    local debug_log="${NEO4J_LOG_DIR}/debug.log"
    
    # Check for APOC periodic iterate stalling (based on your experience)
    if [[ -f "$debug_log" ]]; then
        local apoc_stalls=$(grep -c "apoc.periodic.iterate.*timeout\|apoc.periodic.*stalled\|Transaction timeout" "$debug_log" 2>/dev/null | tr -d '\n' || echo "0")
        if [[ "$apoc_stalls" -gt 0 ]]; then
            emit_crash_alert "APOC_STALLING" "warning" \
                "Detected $apoc_stalls APOC procedure stalling/timeout event(s)" \
                "apoc_procedure_stalling" \
                "Check for missing indexes, large batch sizes, or lock contention"
        fi
    fi
    
    # Check for long-running transactions that might indicate stalling
    local long_transactions=$(cypher-shell -u neo4j -p "$NEO4J_PASSWORD" "CALL dbms.listTransactions() YIELD transactionId, elapsedTimeMillis WHERE elapsedTimeMillis > 300000 RETURN count(*) as longRunning" 2>/dev/null | tail -1 | tr -d '\n' || echo "0")
    
    if [[ "$long_transactions" -gt 0 ]]; then
        emit_crash_alert "LONG_RUNNING_TRANSACTIONS" "warning" \
            "Found $long_transactions transaction(s) running longer than 5 minutes" \
            "transaction_stalling" \
            "Investigate long-running transactions for potential deadlocks or performance issues"
    fi
}

# Function to emit crash pattern alerts
emit_crash_alert() {
    local alert_type="$1"
    local severity="$2"
    local message="$3"
    local pattern_type="$4"
    local recommended_action="$5"
    
    local alert_metadata=$(jq -n \
        --arg alertType "$alert_type" \
        --arg severity "$severity" \
        --arg message "$message" \
        --arg component "neo4j" \
        --arg patternType "$pattern_type" \
        --arg recommendedAction "$recommended_action" \
        --arg detector "neo4jCrashPatternDetector" \
        '{
            alertType: $alertType,
            severity: $severity,
            message: $message,
            component: $component,
            patternType: $patternType,
            recommendedAction: $recommendedAction,
            detector: $detector,
            timestamp: now | strftime("%Y-%m-%dT%H:%M:%S%z")
        }')
    
    emit_task_event "HEALTH_ALERT" "neo4jCrashPatternDetector" "crash_pattern" "$alert_metadata"
}

# Main execution
main() {
    echo "🔍 Starting Neo4j crash pattern detection..."
    
    # Run all crash pattern checks
    check_oom_patterns
    check_heap_and_gc_health
    check_apoc_stalling_patterns
    
    emit_task_event "TASK_END" "neo4jCrashPatternDetector" "system" '{
        "message": "Neo4j crash pattern detection completed",
        "status": "success",
        "patternsChecked": ["oom_errors", "heap_gc_health", "apoc_stalling"],
        "component": "neo4jCrashPatternDetector"
    }'
    
    echo "✅ Neo4j crash pattern detection completed"
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
