#!/bin/bash

# GC Log Analysis Script for Neo4j Survivor Space Issues
# Usage: ./analyze-gc-logs.sh [gc.log file path]

GC_LOG=${1:-"/var/log/neo4j/gc.log"}

if [[ ! -f "$GC_LOG" ]]; then
    echo "Error: GC log file not found: $GC_LOG"
    exit 1
fi

echo "=== Neo4j GC Log Analysis ==="
echo "Analyzing: $GC_LOG"
echo "File size: $(du -h "$GC_LOG" | cut -f1)"
echo "Last modified: $(stat -c %y "$GC_LOG" 2>/dev/null || stat -f %Sm "$GC_LOG")"
echo ""

echo "=== GC Event Summary ==="
echo "Young GC events: $(grep -c "GC(.*) Pause Young" "$GC_LOG")"
echo "Mixed GC events: $(grep -c "GC(.*) Pause Mixed" "$GC_LOG")"
echo "Full GC events: $(grep -c "GC(.*) Pause Full" "$GC_LOG")"
echo "Concurrent cycles: $(grep -c "GC(.*) Concurrent" "$GC_LOG")"
echo ""

echo "=== Survivor Space Analysis ==="
echo "Recent survivor space events (last 20):"
grep -E "(Survivor|From|To)" "$GC_LOG" | tail -20
echo ""

echo "=== Eden Space Patterns ==="
echo "Recent Eden space events (last 10):"
grep -E "Eden.*->" "$GC_LOG" | tail -10
echo ""

echo "=== GC Timing Analysis ==="
echo "Recent GC pause times (last 15):"
grep -E "GC\(.*\).*ms" "$GC_LOG" | tail -15 | sed 's/.*GC(/GC(/' | awk '{print $1, $NF}'
echo ""

echo "=== Memory Pressure Indicators ==="
echo "Allocation failures:"
grep -c "Allocation Failure" "$GC_LOG"
echo "G1 evacuation failures:"
grep -c "Evacuation Failure" "$GC_LOG"
echo "Humongous allocations:"
grep -c "Humongous" "$GC_LOG"
echo ""

echo "=== Recent Critical Events ==="
echo "Last 5 significant GC events:"
grep -E "(Pause|Concurrent)" "$GC_LOG" | tail -5
