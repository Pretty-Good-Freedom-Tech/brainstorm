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
        "phase": "metrics_collection_debug"
    }'
    
    # Get the main Neo4j server process (not the boot process)
    # Look for the process with CommunityEntryPoint or EntryPoint (main server)
    local neo4j_pid=$(pgrep -f "CommunityEntryPoint\|EntryPoint" | head -1)
    
    # Fallback: if EntryPoint search fails, use neo4j status command
    if [[ -z "$neo4j_pid" ]]; then
        neo4j_pid=$(sudo neo4j status 2>/dev/null | grep -o "pid [0-9]*" | awk '{print $2}' || echo "")
    fi
    
    # Final fallback: look for java process with larger memory allocation (main server)
    if [[ -z "$neo4j_pid" ]]; then
        neo4j_pid=$(ps aux | grep neo4j | grep java | grep -v grep | awk '$6 > 1000000 {print $2}' | head -1)
    fi
    if [[ -z "$neo4j_pid" ]]; then
        emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" '{
            "message": "Neo4j process not found, skipping heap analysis",
            "phase": "metrics_collection_debug"
        }'
        return
    fi
    
    # DEBUG: Output PID detection results to console
    echo "DEBUG: Neo4j PID detected: $neo4j_pid"
    echo "DEBUG: Process details:"
    ps aux | grep "$neo4j_pid" | grep -v grep || echo "  No process found for PID $neo4j_pid"
    
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
            local metaspace_data=$(jq -r '.metaspace // empty' "$metrics_file" 2>/dev/null)
            local compressed_class_data=$(jq -r '.compressedClass // empty' "$metrics_file" 2>/dev/null)
            local survivor_data=$(jq -r '.survivor // empty' "$metrics_file" 2>/dev/null)
            local gc_data=$(jq -r '.gc // empty' "$metrics_file" 2>/dev/null)
            
            emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" "$(jq -n \
                --arg heapData "$heap_data" \
                --arg metaspaceData "$metaspace_data" \
                --arg compressedClassData "$compressed_class_data" \
                --arg survivorData "$survivor_data" \
                --arg gcData "$gc_data" \
                '{
                    "message": "Parsed enhanced metrics data",
                    "phase": "metrics_collection_debug",
                    "debug": {
                        "heapDataPresent": ($heapData != "empty" and $heapData != "null" and $heapData != ""),
                        "metaspaceDataPresent": ($metaspaceData != "empty" and $metaspaceData != "null" and $metaspaceData != ""),
                        "compressedClassDataPresent": ($compressedClassData != "empty" and $compressedClassData != "null" and $compressedClassData != ""),
                        "survivorDataPresent": ($survivorData != "empty" and $survivorData != "null" and $survivorData != ""),
                        "gcDataPresent": ($gcData != "empty" and $gcData != "null" and $gcData != "")
                    }
                }')"
            
            if [[ -n "$heap_data" && "$heap_data" != "null" && "$heap_data" != "empty" ]]; then
                heap_used=$(echo "$heap_data" | jq -r '.usedBytes')
                heap_total=$(echo "$heap_data" | jq -r '.totalBytes')
                heap_percent=$(echo "$heap_data" | jq -r '.percentUsed' | awk '{printf "%.0f", $1}')
                
                # Extract Old Gen and Young Gen data
                local old_gen_used=$(echo "$heap_data" | jq -r '.oldUsed // 0')
                local old_gen_capacity=$(echo "$heap_data" | jq -r '.oldTotal // 0')
                local young_gen_used=$(echo "$heap_data" | jq -r '.youngUsed // 0')
                local young_gen_capacity=$(echo "$heap_data" | jq -r '.youngTotal // 0')
                
                metrics_source="enhanced_collector"
                echo "DEBUG: Using enhanced metrics collector for heap data"
                echo "DEBUG: Heap used: $heap_used bytes, total: $heap_total bytes, percent: $heap_percent%"
                echo "DEBUG: Old Gen used: $old_gen_used bytes, capacity: $old_gen_capacity bytes"
                echo "DEBUG: Young Gen used: $young_gen_used bytes, capacity: $young_gen_capacity bytes"
            fi
            
            # Process metaspace data from enhanced metrics
            local metaspace_used=0
            local metaspace_committed=0
            local metaspace_reserved=0
            local metaspace_percent=0
            
            if [[ -n "$metaspace_data" && "$metaspace_data" != "null" && "$metaspace_data" != "empty" ]]; then
                metaspace_used=$(echo "$metaspace_data" | jq -r '.usedBytes')
                metaspace_committed=$(echo "$metaspace_data" | jq -r '.totalBytes')
                
                # Get reserved metaspace from JVM flags or use default (1GB)
                local max_metaspace_size=$(sudo jcmd $neo4j_pid VM.flags 2>/dev/null | grep -oP 'MaxMetaspaceSize=\K\d+' || echo "1073741824")
                metaspace_reserved=${max_metaspace_size:-1073741824}  # Default 1GB if not set
                
                # Calculate percentage of reserved space being used
                if [[ "$metaspace_reserved" -gt 0 ]]; then
                    metaspace_percent=$(echo "scale=2; ($metaspace_used / $metaspace_reserved) * 100" | bc | awk '{printf "%.0f", $1}')
                fi
                
                echo "DEBUG: Using enhanced metrics collector for metaspace data"
                echo "DEBUG: Metaspace used: $metaspace_used bytes, committed: $metaspace_committed bytes, reserved: $metaspace_reserved bytes, percent: $metaspace_percent%"
            else
                echo "DEBUG: No metaspace data in enhanced metrics, will use fallback jstat method"
            fi
            
            # Process compressed class space data from enhanced metrics
            local compressed_class_used=0
            local compressed_class_committed=0
            local compressed_class_reserved=0
            local compressed_class_percent=0
            
            if [[ -n "$compressed_class_data" && "$compressed_class_data" != "null" && "$compressed_class_data" != "empty" ]]; then
                compressed_class_used=$(echo "$compressed_class_data" | jq -r '.usedBytes')
                compressed_class_committed=$(echo "$compressed_class_data" | jq -r '.totalBytes')
                
                # Get reserved compressed class space from JVM flags or use default (1GB)
                local compressed_class_size=$(sudo jcmd $neo4j_pid VM.flags 2>/dev/null | grep -oP 'CompressedClassSpaceSize=\K\d+' || echo "1073741824")
                compressed_class_reserved=${compressed_class_size:-1073741824}  # Default 1GB if not set
                
                # Calculate percentage of reserved space being used
                if [[ "$compressed_class_reserved" -gt 0 ]]; then
                    compressed_class_percent=$(echo "scale=2; ($compressed_class_used / $compressed_class_reserved) * 100" | bc | awk '{printf "%.0f", $1}')
                fi
                
                echo "DEBUG: Using enhanced metrics collector for compressed class space data"
                echo "DEBUG: Compressed class used: $compressed_class_used bytes, total: $compressed_class_total bytes, percent: $compressed_class_percent%"
            fi
            
            # Process survivor space data from enhanced metrics
            local survivor_used=0
            local survivor_total=0
            local survivor_percent=0
            local s0_used=0
            local s0_capacity=0
            local s1_used=0
            local s1_capacity=0
            
            if [[ -n "$survivor_data" && "$survivor_data" != "null" && "$survivor_data" != "empty" ]]; then
                survivor_used=$(echo "$survivor_data" | jq -r '.usedBytes')
                survivor_total=$(echo "$survivor_data" | jq -r '.totalBytes')
                survivor_percent=$(echo "$survivor_data" | jq -r '.percentUsed' | awk '{printf "%.0f", $1}')
                s0_used=$(echo "$survivor_data" | jq -r '.s0Used')
                s0_capacity=$(echo "$survivor_data" | jq -r '.s0Capacity')
                s1_used=$(echo "$survivor_data" | jq -r '.s1Used')
                s1_capacity=$(echo "$survivor_data" | jq -r '.s1Capacity')
                echo "DEBUG: Using enhanced metrics collector for survivor space data"
                echo "DEBUG: Survivor used: $survivor_used bytes, total: $survivor_total bytes, percent: $survivor_percent%"
                echo "DEBUG: S0: $s0_used/$s0_capacity bytes, S1: $s1_used/$s1_capacity bytes"
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
            # DEBUG: Output jstat commands and results
            echo "DEBUG: Executing jstat commands for PID $neo4j_pid"
            echo "DEBUG: Command 1: sudo jstat -gc $neo4j_pid"
            local heap_info=$(sudo jstat -gc "$neo4j_pid" 2>/dev/null || echo "")
            echo "DEBUG: jstat -gc result:"
            echo "$heap_info"
            echo "DEBUG: Command 2: sudo jstat -class $neo4j_pid"
            local metaspace_info=$(sudo jstat -class "$neo4j_pid" 2>/dev/null || echo "")
            echo "DEBUG: jstat -class result:"
            echo "$metaspace_info"
            
            emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" "$(jq -n \
                --argjson hasHeapInfo "$(test -n "$heap_info" && echo true || echo false)" \
                --argjson hasMetaspaceInfo "$(test -n "$metaspace_info" && echo true || echo false)" \
                '{
                    "message": "jstat command executed",
                    "phase": "metrics_collection_debug",
                    "debug": {
                        "heapInfoRetrieved": $hasHeapInfo,
                        "metaspaceInfoRetrieved": $hasMetaspaceInfo
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
                
                # Parse metaspace utilization if available
                local metaspace_used=0
                local metaspace_total=0
                local metaspace_percent=0
                
                if [[ -n "$metaspace_info" ]]; then
                    local metaspace_data=$(echo "$metaspace_info" | tail -1)
                    # jstat -class shows: Loaded Bytes Unloaded Bytes Time
                    metaspace_used=$(echo "$metaspace_data" | awk '{print $2}')
                    echo "DEBUG: Metaspace from jstat -class: used=$metaspace_used bytes"
                    
                    # Use jstat -gc for more reliable metaspace data (MU and MC columns)
                    echo "DEBUG: Command 3: sudo jstat -gc $neo4j_pid (for metaspace MC/MU)"
                    local gc_info=$(sudo jstat -gc "$neo4j_pid" 2>/dev/null || echo "")
                    echo "DEBUG: jstat -gc result for metaspace:"
                    echo "$gc_info"
                    if [[ -n "$gc_info" ]]; then
                        local gc_header=$(echo "$gc_info" | head -1)
                        local gc_data=$(echo "$gc_info" | tail -1)
                        
                        echo "DEBUG: jstat -gc header: $gc_header"
                        echo "DEBUG: jstat -gc data: $gc_data"
                        
                        # Find MC and MU column positions dynamically
                        local mc_col=$(echo "$gc_header" | tr ' ' '\n' | grep -n "^MC$" | cut -d: -f1 2>/dev/null || echo "0")
                        local mu_col=$(echo "$gc_header" | tr ' ' '\n' | grep -n "^MU$" | cut -d: -f1 2>/dev/null || echo "0")
                        
                        echo "DEBUG: MC column position: $mc_col"
                        echo "DEBUG: MU column position: $mu_col"
                        
                        local mc_value="0"
                        local mu_value="0"
                        
                        if [[ "$mc_col" -gt 0 ]]; then
                            mc_value=$(echo "$gc_data" | awk -v col="$mc_col" '{print $col}' 2>/dev/null || echo "0")
                        fi
                        
                        if [[ "$mu_col" -gt 0 ]]; then
                            mu_value=$(echo "$gc_data" | awk -v col="$mu_col" '{print $col}' 2>/dev/null || echo "0")
                        fi
                        
                        echo "DEBUG: Parsed MC (metaspace capacity): $mc_value KB"
                        echo "DEBUG: Parsed MU (metaspace used): $mu_value KB"
                        
                        # Convert from KB to bytes for consistency
                        if [[ "$mc_value" =~ ^[0-9]+\.?[0-9]*$ ]] && [[ $(echo "$mc_value > 0" | bc -l 2>/dev/null || echo "0") == "1" ]]; then
                            metaspace_total=$(echo "$mc_value * 1024" | bc -l 2>/dev/null | awk '{printf "%.0f", $1}')
                            echo "DEBUG: Converted MC to bytes: $metaspace_total"
                        fi
                        
                        # Use MU from jstat -gc if available, otherwise fall back to jstat -class
                        if [[ "$mu_value" =~ ^[0-9]+\.?[0-9]*$ ]] && [[ $(echo "$mu_value > 0" | bc -l 2>/dev/null || echo "0") == "1" ]]; then
                            metaspace_used=$(echo "$mu_value * 1024" | bc -l 2>/dev/null | awk '{printf "%.0f", $1}')
                            echo "DEBUG: Using MU from jstat -gc, converted to bytes: $metaspace_used"
                        fi
                        
                        # Calculate metaspace percentage
                        if [[ "$metaspace_total" -gt 0 && "$metaspace_used" -gt 0 ]]; then
                            metaspace_percent=$(echo "$metaspace_used $metaspace_total" | awk '{printf "%.0f", ($1 * 100) / $2}')
                            echo "DEBUG: Calculated metaspace percentage: $metaspace_percent% (used: $metaspace_used, total: $metaspace_total)"
                        else
                            echo "DEBUG: Cannot calculate metaspace percentage - used: $metaspace_used, total: $metaspace_total"
                        fi
                    fi
                    
                    # Fallback: if we still don't have capacity, try jstat -gccapacity with better column detection
                    if [[ "$metaspace_total" -eq 0 ]]; then
                        local capacity_info=$(sudo jstat -gccapacity "$neo4j_pid" 2>/dev/null || echo "")
                        if [[ -n "$capacity_info" ]]; then
                            # Get header to identify MC column position
                            local header=$(echo "$capacity_info" | head -1)
                            local capacity_data=$(echo "$capacity_info" | tail -1)
                            
                            # Find MC column position dynamically
                            local mc_col=$(echo "$header" | tr ' ' '\n' | grep -n "MC" | cut -d: -f1 2>/dev/null || echo "0")
                            if [[ "$mc_col" -gt 0 ]]; then
                                metaspace_total=$(echo "$capacity_data" | awk -v col="$mc_col" '{print $col * 1024}' 2>/dev/null || echo "0")
                                
                                if [[ "$metaspace_total" -gt 0 && "$metaspace_used" -gt 0 ]]; then
                                    metaspace_percent=$(echo "$metaspace_used $metaspace_total" | awk '{printf "%.0f", ($1 * 100) / $2}')
                                fi
                            fi
                        fi
                    fi
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
    
    # Calculate GC overhead (time spent in GC) - preserve original calculation logic
    local total_gc_time=$(echo "${young_gc_time:-0} ${full_gc_time:-0}" | awk '{print $1 + $2}')
    local gc_overhead_percent=0
    
    # Estimate runtime (this is approximate)
    local uptime_seconds=$(ps -o etime= -p "$neo4j_pid" 2>/dev/null | awk -F: '{if(NF==3) print $1*3600+$2*60+$3; else if(NF==2) print $1*60+$2; else print $1}' || echo "0")
    if [[ "$uptime_seconds" -gt 0 && $(echo "$total_gc_time > 0" | bc -l 2>/dev/null || echo "0") -eq 1 ]]; then
        gc_overhead_percent=$(echo "$total_gc_time $uptime_seconds" | awk '{printf "%.1f", ($1 * 100) / $2}')
    fi
    
    # Always emit heap_gc_analysis with complete metrics structure, using null for unavailable data
    emit_task_event "PROGRESS" "neo4jCrashPatternDetector" "heap_gc_analysis" "$(jq -n \
        --argjson heapPercent "$(test -n "$heap_percent" && test "$heap_percent" -gt 0 && echo "$heap_percent" || echo "null")" \
        --argjson heapUsedMB "$(test -n "$heap_used" && test "$heap_used" -gt 0 && echo "$heap_used" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson heapTotalMB "$(test -n "$heap_total" && test "$heap_total" -gt 0 && echo "$heap_total" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson metaspacePercent "$(test -n "$metaspace_percent" && test "$metaspace_percent" -gt 0 && echo "$metaspace_percent" || echo "null")" \
        --argjson metaspaceUsedMB "$(test -n "$metaspace_used" && test "$metaspace_used" -gt 0 && echo "$metaspace_used" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson metaspaceCommittedMB "$(test -n "$metaspace_committed" && echo "$metaspace_committed" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson metaspaceReservedMB "$(test -n "$metaspace_reserved" && echo "$metaspace_reserved" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson youngGcCount "$(test -n "$young_gc_count" && echo "$young_gc_count" || echo "null")" \
        --arg youngGcTime "${young_gc_time:-null}" \
        --argjson fullGcCount "$(test -n "$full_gc_count" && echo "$full_gc_count" || echo "null")" \
        --arg fullGcTime "${full_gc_time:-null}" \
        --arg gcOverheadPercent "$gc_overhead_percent" \
        --arg metricsSource "$metrics_source" \
        --argjson oldGenUsedMB "$(test -n "$old_gen_used" && echo "$old_gen_used" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson oldGenCapacityMB "$(test -n "$old_gen_capacity" && echo "$old_gen_capacity" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson youngGenUsedMB "$(test -n "$young_gen_used" && echo "$young_gen_used" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson youngGenCapacityMB "$(test -n "$young_gen_capacity" && echo "$young_gen_capacity" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson compressedClassUsedMB "$(test -n "$compressed_class_used" && echo "$compressed_class_used" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson compressedClassCommittedMB "$(test -n "$compressed_class_committed" && echo "$compressed_class_committed" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson compressedClassReservedMB "$(test -n "$compressed_class_reserved" && echo "$compressed_class_reserved" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson survivorUsedMB "$(test -n "$survivor_used" && echo "$survivor_used" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson survivorCapacityMB "$(test -n "$survivor_total" && echo "$survivor_total" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson s0UsedMB "$(test -n "$s0_used" && echo "$s0_used" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson s0CapacityMB "$(test -n "$s0_capacity" && echo "$s0_capacity" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson s1UsedMB "$(test -n "$s1_used" && echo "$s1_used" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        --argjson s1CapacityMB "$(test -n "$s1_capacity" && echo "$s1_capacity" | awk '{printf "%.0f", $1/1024/1024}' || echo "null")" \
        '{
            "message": "Current heap, metaspace and GC metrics analyzed",
            "phase": "heap_gc_health_check",
            "metrics": {
                "heapUtilizationPercent": $heapPercent,
                "heapUsedMB": $heapUsedMB,
                "heapTotalMB": $heapTotalMB,
                "metaspaceUtilizationPercent": $metaspacePercent,
                "metaspaceUsedMB": $metaspaceUsedMB,
                "metaspaceCommittedMB": $metaspaceCommittedMB,
                "metaspaceReservedMB": $metaspaceReservedMB,
                "oldGenUsedMB": $oldGenUsedMB,
                "oldGenCapacityMB": $oldGenCapacityMB,
                "youngGenUsedMB": $youngGenUsedMB,
                "youngGenCapacityMB": $youngGenCapacityMB,
                "compressedClassUsedMB": $compressedClassUsedMB,
                "compressedClassCommittedMB": $compressedClassCommittedMB,
                "compressedClassReservedMB": $compressedClassReservedMB,
                "survivorUsedMB": $survivorUsedMB,
                "survivorCapacityMB": $survivorCapacityMB,
                "s0UsedMB": $s0UsedMB,
                "s0CapacityMB": $s0CapacityMB,
                "s1UsedMB": $s1UsedMB,
                "s1CapacityMB": $s1CapacityMB,
                "youngGcCount": $youngGcCount,
                "youngGcTimeSeconds": $youngGcTime,
                "fullGcCount": $fullGcCount,
                "fullGcTimeSeconds": $fullGcTime,
                "gcTimePercent": $gcOverheadPercent,
                "gcOverheadPercent": $gcOverheadPercent
            },
            "metricsSource": $metricsSource,
            "dataAvailability": {
                "heapData": ($heapPercent != null),
                "metaspaceData": ($metaspacePercent != null),
                "gcData": ($youngGcCount != null or $fullGcCount != null),
                "gcOverheadCalculated": ($gcOverheadPercent != "0")
            }
        }')"
    
    # Generate alerts based on available thresholds (moved outside metrics availability check)
    # Heap alerts - only if we have valid heap data
    if [[ "$metrics_source" != "unavailable" && "$heap_percent" -gt 0 ]]; then
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
    fi
    
    # GC overhead alerts - can work with partial metrics if GC data is available
    if [[ $(echo "$gc_overhead_percent > 0" | bc -l 2>/dev/null || echo "0") -eq 1 ]]; then
        local gc_overhead_int=$(echo "$gc_overhead_percent" | awk '{printf "%.0f", $1}')
        if [[ "$gc_overhead_int" -ge "$NEO4J_GC_OVERHEAD_THRESHOLD" ]]; then
            emit_crash_alert "NEO4J_GC_THRASHING" "critical" \
                "Neo4j GC overhead at ${gc_overhead_percent}% (threshold: ${NEO4J_GC_OVERHEAD_THRESHOLD}%)" \
                "gc_thrashing" \
                "JVM spending too much time in garbage collection. Increase heap or optimize queries"
        fi
    fi
    
    # Full GC frequency alerts - only if we have valid GC count data
    if [[ "$metrics_source" != "unavailable" && "$full_gc_count" -gt 0 ]]; then
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