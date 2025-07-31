#!/bin/bash

# Recovery script for stalled APOC processes
# Usage: sudo bash recoverApocStall.sh [customer_name]

CUSTOMER_NAME=${1:-"laeserin"}
CONFIG_FILE="/etc/brainstorm.conf"
source "$CONFIG_FILE"

echo "=== APOC STALL RECOVERY SCRIPT ==="
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

# Kill long-running APOC transactions
echo "=== STEP 1: IDENTIFY AND KILL STALLED TRANSACTIONS ==="

# Get list of long-running APOC transactions
echo "Finding long-running APOC transactions..."
STALLED_TXS=$(timeout 30s cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "CALL dbms.listTransactions() YIELD transactionId, currentQuery, elapsedTimeMillis WHERE currentQuery CONTAINS 'apoc.periodic.iterate' AND elapsedTimeMillis > 300000 RETURN transactionId" --format plain 2>/dev/null | grep -v "transactionId" | grep -v "^$" || echo "")

if [ -n "$STALLED_TXS" ]; then
    echo "Found stalled APOC transactions:"
    echo "$STALLED_TXS"
    echo ""
    
    # Kill each stalled transaction
    while IFS= read -r tx_id; do
        if [ -n "$tx_id" ] && [ "$tx_id" != "transactionId" ]; then
            echo "Killing transaction: $tx_id"
            timeout 30s cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "CALL dbms.killTransaction('$tx_id')" 2>&1 || echo "Failed to kill transaction $tx_id"
        fi
    done <<< "$STALLED_TXS"
else
    echo "No stalled APOC transactions found"
fi
echo ""

# Wait for transactions to be killed
echo "Waiting 10 seconds for transactions to be terminated..."
sleep 10

# Verify transactions are gone
echo "=== STEP 2: VERIFY CLEANUP ==="
run_neo4j_query "CALL dbms.listTransactions() YIELD transactionId, currentQuery, elapsedTimeMillis WHERE currentQuery CONTAINS 'apoc' RETURN count(*) as remainingApocTransactions" "Remaining APOC Transactions"

# Check system resources after cleanup
echo "=== STEP 3: SYSTEM RESOURCE CHECK ==="
echo "Memory usage after cleanup:"
free -h
echo ""

run_neo4j_query "CALL dbms.queryJvm('java.lang:type=Memory') YIELD attributes RETURN attributes.HeapMemoryUsage as heapUsage" "JVM Memory After Cleanup"

# Get customer ID for progress check
CUSTOMER_ID=$(grep -E "^${CUSTOMER_NAME}=" /var/lib/brainstorm/customers/customerIds.txt | cut -d'=' -f2)

if [ -n "$CUSTOMER_ID" ]; then
    echo "=== STEP 4: PROGRESS ASSESSMENT ==="
    run_neo4j_query "MATCH (u:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID}) RETURN count(u) as totalNodes, count(CASE WHEN u.influence IS NOT NULL THEN 1 END) as updatedNodes, (count(CASE WHEN u.influence IS NOT NULL THEN 1 END) * 100.0 / count(u)) as percentComplete" "Update Progress for $CUSTOMER_NAME"
    
    # Check for partial updates that might indicate where it stalled
    run_neo4j_query "MATCH (u:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID}) WHERE u.influence IS NOT NULL WITH u ORDER BY u.observee_pubkey RETURN u.observee_pubkey LIMIT 5" "First 5 Updated Records"
    
    run_neo4j_query "MATCH (u:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID}) WHERE u.influence IS NOT NULL WITH u ORDER BY u.observee_pubkey DESC RETURN u.observee_pubkey LIMIT 5" "Last 5 Updated Records"
fi

echo "=== STEP 5: RECOMMENDATIONS ==="
echo ""
echo "Based on the recovery analysis:"
echo ""
echo "1. RESTART STRATEGY:"
echo "   - If <50% complete: Restart the full update process"
echo "   - If >50% complete: Consider resuming from where it left off"
echo ""
echo "2. OPTIMIZATION RECOMMENDATIONS:"
echo "   - Reduce batch size to 50-100 (current script uses 100)"
echo "   - Ensure adequate heap memory (recommend 8GB+ for 189k records)"
echo "   - Run during low-activity periods"
echo ""
echo "3. MONITORING:"
echo "   - Use the enhanced updateNeo4jWithApoc.js with real-time monitoring"
echo "   - Watch /var/log/neo4j/neo4j.log during execution"
echo "   - Set up alerts for memory usage >80%"
echo ""
echo "4. PREVENTION:"
echo "   - Add index on (customer_id, observee_pubkey) if not exists"
echo "   - Consider splitting large updates into smaller chunks"
echo "   - Monitor system resources before starting"
echo ""

# Create index if it doesn't exist
echo "=== STEP 6: INDEX OPTIMIZATION ==="
echo "Checking/creating optimal indexes..."

# Check if composite index exists
INDEX_EXISTS=$(timeout 30s cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "SHOW INDEXES YIELD name, labelsOrTypes, properties WHERE 'NostrUserWotMetricsCard' IN labelsOrTypes AND 'customer_id' IN properties AND 'observee_pubkey' IN properties RETURN count(*) as indexCount" --format plain 2>/dev/null | grep -v "indexCount" | grep -v "^$" | head -1 || echo "0")

if [ "$INDEX_EXISTS" = "0" ]; then
    echo "Creating composite index for better performance..."
    timeout 60s cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "CREATE INDEX NostrUserWotMetricsCard_customer_observee IF NOT EXISTS FOR (n:NostrUserWotMetricsCard) ON (n.customer_id, n.observee_pubkey)" 2>&1 || echo "Failed to create index"
else
    echo "Composite index already exists"
fi

echo ""
echo "=== RECOVERY SCRIPT COMPLETE ==="
echo "Timestamp: $(date)"
echo ""
echo "Next steps:"
echo "1. Review the progress assessment above"
echo "2. Run the enhanced updateNeo4jWithApoc.js script"
echo "3. Monitor progress using: sudo bash debugApocStall.sh $CUSTOMER_NAME"
