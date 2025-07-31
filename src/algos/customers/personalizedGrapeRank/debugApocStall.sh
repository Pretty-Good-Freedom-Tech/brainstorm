#!/bin/bash

# Debug script for APOC stalling issues
# Usage: sudo bash debugApocStall.sh [customer_name]

CUSTOMER_NAME=${1:-"laeserin"}
CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE"

echo "=== APOC STALL DEBUGGING SCRIPT ==="
echo "Customer: $CUSTOMER_NAME"
echo "Timestamp: $(date)"
echo ""

# Function to run Neo4j query safely
run_neo4j_query() {
    local query="$1"
    local description="$2"
    
    echo "--- $description ---"
    timeout 30s cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$query" 2>&1 || echo "Query timed out or failed"
    echo ""
}

# Check Neo4j service status
echo "--- Neo4j Service Status ---"
systemctl status neo4j --no-pager -l
echo ""

# Check system resources
echo "--- System Resources ---"
echo "Memory usage:"
free -h
echo ""
echo "Disk usage:"
df -h /var/lib/neo4j
echo ""
echo "CPU load:"
uptime
echo ""

# Check Neo4j memory configuration
run_neo4j_query "CALL dbms.listConfig() YIELD name, value WHERE name CONTAINS 'memory' OR name CONTAINS 'heap' OR name CONTAINS 'pagecache' RETURN name, value ORDER BY name" "Neo4j Memory Configuration"

# Check active transactions
run_neo4j_query "CALL dbms.listTransactions() YIELD transactionId, currentQuery, status, startTime, elapsedTimeMillis RETURN transactionId, status, startTime, elapsedTimeMillis, substring(currentQuery, 0, 100) as queryPreview ORDER BY elapsedTimeMillis DESC" "Active Transactions"

# Check for long-running queries
run_neo4j_query "CALL dbms.listQueries() YIELD queryId, query, elapsedTimeMillis, status WHERE elapsedTimeMillis > 60000 RETURN queryId, elapsedTimeMillis, status, substring(query, 0, 100) as queryPreview ORDER BY elapsedTimeMillis DESC" "Long-Running Queries (>1 minute)"

# Check indexes on target table
run_neo4j_query "SHOW INDEXES YIELD name, labelsOrTypes, properties, state WHERE 'NostrUserWotMetricsCard' IN labelsOrTypes" "Indexes on NostrUserWotMetricsCard"

# Check constraint violations
run_neo4j_query "SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties, ownedIndexName WHERE 'NostrUserWotMetricsCard' IN labelsOrTypes" "Constraints on NostrUserWotMetricsCard"

# Check target node count for customer
CUSTOMER_ID=$(grep -E "^${CUSTOMER_NAME}=" /var/lib/brainstorm/customers/customerIds.txt | cut -d'=' -f2)
if [ -n "$CUSTOMER_ID" ]; then
    run_neo4j_query "MATCH (u:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID}) RETURN count(u) as totalNodes, count(CASE WHEN u.influence IS NOT NULL THEN 1 END) as updatedNodes" "Target Nodes for Customer $CUSTOMER_NAME (ID: $CUSTOMER_ID)"
else
    echo "Warning: Could not find customer ID for $CUSTOMER_NAME"
fi

# Check JVM memory usage
run_neo4j_query "CALL dbms.queryJvm('java.lang:type=Memory') YIELD attributes RETURN attributes.HeapMemoryUsage as heapUsage, attributes.NonHeapMemoryUsage as nonHeapUsage" "JVM Memory Usage"

# Check garbage collection stats
run_neo4j_query "CALL dbms.queryJvm('java.lang:type=GarbageCollector,name=*') YIELD attributes RETURN attributes" "Garbage Collection Stats"

# Check Neo4j logs for recent errors
echo "--- Recent Neo4j Log Errors ---"
if [ -f "/var/log/neo4j/neo4j.log" ]; then
    echo "Last 20 error/warning lines from neo4j.log:"
    tail -1000 /var/log/neo4j/neo4j.log | grep -i "error\|warn\|exception\|timeout\|memory\|apoc" | tail -20
    echo ""
    
    echo "APOC-related log entries from last hour:"
    find /var/log/neo4j/ -name "*.log" -mmin -60 -exec grep -l "apoc" {} \; | head -3 | xargs grep -i "apoc" | tail -10
else
    echo "Neo4j log file not found at /var/log/neo4j/neo4j.log"
fi
echo ""

# Check for deadlocks
echo "--- Checking for Deadlocks ---"
if [ -f "/var/log/neo4j/debug.log" ]; then
    echo "Recent deadlock entries:"
    tail -1000 /var/log/neo4j/debug.log | grep -i "deadlock" | tail -5
else
    echo "Debug log not found"
fi
echo ""

# Check file system and JSON file
echo "--- JSON File Analysis ---"
JSON_FILE="/var/lib/neo4j/import/graperank_updates_${CUSTOMER_NAME}.json"
if [ -f "$JSON_FILE" ]; then
    echo "JSON file stats:"
    ls -lh "$JSON_FILE"
    echo "Line count: $(wc -l < "$JSON_FILE")"
    echo "File size: $(du -h "$JSON_FILE" | cut -f1)"
    echo "First few lines:"
    head -3 "$JSON_FILE"
    echo "Last few lines:"
    tail -3 "$JSON_FILE"
    
    # Check for JSON validity
    echo "JSON validity check:"
    if command -v jq >/dev/null 2>&1; then
        if jq empty "$JSON_FILE" 2>/dev/null; then
            echo "✓ JSON file is valid"
        else
            echo "✗ JSON file is invalid"
            echo "First JSON error:"
            jq empty "$JSON_FILE" 2>&1 | head -1
        fi
    else
        echo "jq not available for JSON validation"
    fi
else
    echo "JSON file not found: $JSON_FILE"
fi
echo ""

# Check Neo4j configuration file
echo "--- Neo4j Configuration ---"
if [ -f "/etc/neo4j/neo4j.conf" ]; then
    echo "Key configuration settings:"
    grep -E "^(dbms\.memory\.|dbms\.transaction\.timeout|dbms\.lock\.acquisition\.timeout)" /etc/neo4j/neo4j.conf || echo "No relevant settings found in neo4j.conf"
else
    echo "Neo4j config file not found"
fi
echo ""

# Recommendations
echo "=== RECOMMENDATIONS ==="
echo "1. If you see active APOC transactions that have been running for >20 minutes, consider killing them"
echo "2. Check heap memory usage - if >80%, increase Neo4j heap size"
echo "3. Ensure indexes exist on customer_id and observee_pubkey for NostrUserWotMetricsCard"
echo "4. Consider reducing batch size from 250 to 50-100 for large datasets"
echo "5. Monitor /var/log/neo4j/neo4j.log during execution for real-time issues"
echo ""

echo "=== DEBUG SCRIPT COMPLETE ==="
echo "Timestamp: $(date)"
