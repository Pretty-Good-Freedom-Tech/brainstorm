#!/bin/bash

# Neo4j Metrics Collector Service
# Runs as neo4j user to collect detailed JVM metrics
# Outputs metrics to shared JSON file for consumption by monitoring scripts

set -e
set -o pipefail

# Configuration
METRICS_OUTPUT_DIR="/var/lib/brainstorm/monitoring"
METRICS_FILE="$METRICS_OUTPUT_DIR/neo4j_metrics.json"
COLLECTION_INTERVAL=${2:-30}  # Default 30 seconds

# Ensure output directory exists
mkdir -p "$METRICS_OUTPUT_DIR"

# Function to collect Neo4j JVM metrics
collect_neo4j_metrics() {
    local timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
    local neo4j_pid=$(pgrep -f "neo4j.*java" | head -1)
    
    if [[ -z "$neo4j_pid" ]]; then
        # Neo4j not running
        cat > "$METRICS_FILE" <<EOF
{
  "timestamp": "$timestamp",
  "status": "neo4j_not_running",
  "pid": null,
  "heap": null,
  "gc": null,
  "threads": null,
  "error": "Neo4j process not found"
}
EOF
        return
    fi
    
    # Collect heap metrics using jstat
    local heap_data=""
    local gc_data=""
    local thread_count=""
    
    if command -v jstat >/dev/null 2>&1; then
        # Get heap utilization
        local heap_raw=$(jstat -gc "$neo4j_pid" 2>/dev/null | tail -1)
        if [[ -n "$heap_raw" ]]; then
            heap_data=$(echo "$heap_raw" | awk '{
                s0c=$1; s1c=$2; s0u=$3; s1u=$4; ec=$5; eu=$6; oc=$7; ou=$8; mc=$9; mu=$10; ccsc=$11; ccsu=$12
                young_total = (s0c + s1c + ec) * 1024
                young_used = (s0u + s1u + eu) * 1024
                old_total = oc * 1024
                old_used = ou * 1024
                total_heap = young_total + old_total
                total_used = young_used + old_used
                heap_percent = (total_used * 100) / total_heap
                printf "{\"totalBytes\":%d,\"usedBytes\":%d,\"percentUsed\":%.2f,\"youngTotal\":%d,\"youngUsed\":%d,\"oldTotal\":%d,\"oldUsed\":%d}", total_heap, total_used, heap_percent, young_total, young_used, old_total, old_used
            }')
            
            # Collect metaspace data separately
            metaspace_data=$(echo "$heap_raw" | awk '{
                mc=$9; mu=$10
                if (mc > 0) {
                    metaspace_total = mc * 1024
                    metaspace_used = mu * 1024
                    metaspace_percent = (metaspace_used * 100) / metaspace_total
                    printf "{\"totalBytes\":%d,\"usedBytes\":%d,\"percentUsed\":%.2f}", metaspace_total, metaspace_used, metaspace_percent
                } else {
                    printf "null"
                }
            }')
            
            # Collect compressed class space data
            compressed_class_data=$(echo "$heap_raw" | awk '{
                ccsc=$11; ccsu=$12
                if (ccsc > 0) {
                    cc_total = ccsc * 1024
                    cc_used = ccsu * 1024
                    cc_percent = (cc_used * 100) / cc_total
                    printf "{\"totalBytes\":%d,\"usedBytes\":%d,\"percentUsed\":%.2f}", cc_total, cc_used, cc_percent
                } else {
                    printf "null"
                }
            }')
            
            # Collect survivor space data
            survivor_data=$(echo "$heap_raw" | awk '{
                s0c=$1; s1c=$2; s0u=$3; s1u=$4
                survivor_total = (s0c + s1c) * 1024
                survivor_used = (s0u + s1u) * 1024
                if (survivor_total > 0) {
                    survivor_percent = (survivor_used * 100) / survivor_total
                    printf "{\"totalBytes\":%d,\"usedBytes\":%d,\"percentUsed\":%.2f,\"s0Capacity\":%d,\"s0Used\":%d,\"s1Capacity\":%d,\"s1Used\":%d}", survivor_total, survivor_used, survivor_percent, s0c*1024, s0u*1024, s1c*1024, s1u*1024
                } else {
                    printf "null"
                }
            }')
        fi
        
        # Get GC statistics with G1GC concurrent cycles
        gc_data=$(echo "$heap_raw" | awk '{
            ygc=$13; ygct=$14; fgc=$15; fgct=$16; cgc=$17; cgct=$18; gct=$19
            # Handle both G1GC format (with CGC) and other GC formats
            if (NF >= 19) {
                # G1GC format with concurrent GC cycles
                printf "{\"youngGC\":%d,\"youngGCTime\":%.3f,\"fullGC\":%d,\"fullGCTime\":%.3f,\"concurrentGC\":%d,\"concurrentGCTime\":%.3f,\"totalGCTime\":%.3f}", ygc, ygct, fgc, fgct, cgc, cgct, gct
            } else {
                # Standard format without concurrent GC
                gct=$17
                printf "{\"youngGC\":%d,\"youngGCTime\":%.3f,\"fullGC\":%d,\"fullGCTime\":%.3f,\"totalGCTime\":%.3f}", ygc, ygct, fgc, fgct, gct
            }
        }')
    fi
    
    # Get thread count
    if [[ -d "/proc/$neo4j_pid/task" ]]; then
        thread_count=$(ls /proc/$neo4j_pid/task | wc -l)
    fi
    
    # Get memory info from /proc
    local proc_memory=""
    if [[ -f "/proc/$neo4j_pid/status" ]]; then
        local vmrss=$(grep "VmRSS:" /proc/$neo4j_pid/status | awk '{print $2 * 1024}')
        local vmsize=$(grep "VmSize:" /proc/$neo4j_pid/status | awk '{print $2 * 1024}')
        proc_memory=$(printf '{"rssBytes":%d,"virtualBytes":%d}' "$vmrss" "$vmsize")
    fi
    
    # Combine all metrics
    cat > "$METRICS_FILE" <<EOF
{
  "timestamp": "$timestamp",
  "status": "running",
  "pid": $neo4j_pid,
  "heap": ${heap_data:-null},
  "metaspace": ${metaspace_data:-null},
  "compressedClass": ${compressed_class_data:-null},
  "survivor": ${survivor_data:-null},
  "gc": ${gc_data:-null},
  "threads": ${thread_count:-null},
  "memory": ${proc_memory:-null},
  "collectionMethod": "jstat_and_proc"
}
EOF
    
    # Set permissions for brainstorm user to read
    chmod 644 "$METRICS_FILE"
}

# Function to run continuous collection
run_collector() {
    echo "Starting Neo4j metrics collector (interval: ${COLLECTION_INTERVAL}s)"
    local collection_count=0
    
    while true; do
        collect_neo4j_metrics
        collection_count=$((collection_count + 1))
        
        # Log status every 10th collection (~6-7 minutes)
        if (( collection_count % 10 == 0 )); then
            local heap_percent=""
            local status=""
            if [[ -f "$METRICS_FILE" ]]; then
                heap_percent=$(grep -o '"percentUsed":[0-9.]*' "$METRICS_FILE" 2>/dev/null | cut -d: -f2 || echo "unknown")
                status=$(grep -o '"status":"[^"]*"' "$METRICS_FILE" 2>/dev/null | cut -d: -f2 | tr -d '"' || echo "unknown")
            fi
            echo "Neo4j metrics collected (count: $collection_count, status: $status, heap: ${heap_percent}%)"
        fi
        
        sleep "$COLLECTION_INTERVAL"
    done
}

# Main execution
case "${1:-run}" in
    "run")
        run_collector
        ;;
    "once")
        collect_neo4j_metrics
        ;;
    *)
        echo "Usage: $0 [run|once] [interval_seconds]"
        echo "  run: Continuous collection (default)"
        echo "  once: Single collection"
        echo "  interval_seconds: Collection interval for continuous mode (default: 30)"
        exit 1
        ;;
esac
