#!/bin/bash

# This script adds NostrUserWotMetricsCard nodes to the neo4j database for a given customer.
# It is called with a command like:
# sudo bash addMetricsCards.sh <customer_id> <customer_pubkey>

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_LOG_DIR

# Check if CUSTOMER_PUBKEY is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <customer_pubkey> <customer_id>"
    exit 1
fi

# Get customer_pubkey
CUSTOMER_PUBKEY="$1"

# Check if CUSTOMER_ID is provided
if [ -z "$2" ]; then
    echo "Usage: $0 <customer_pubkey> <customer_id>"
    exit 1
fi

# Get customer_id
CUSTOMER_ID="$2"

# Batch size for ID-based processing
BATCH_SIZE=50000

# Query to get the min and max node IDs to determine batching range
# Using elementId() instead of deprecated id() function
# Removed WHERE NOT clause since MERGE handles create-if-not-exists
CYPHER_GET_RANGE="MATCH (s:SetOfNostrUserWotMetricsCards)
WHERE NOT (s)-[:SPECIFIC_INSTANCE]->(:NostrUserWotMetricsCard {observer_pubkey: '$CUSTOMER_PUBKEY'})
WITH toInteger(split(elementId(s), ':')[2]) AS numericId
RETURN min(numericId) as minId, max(numericId) as maxId"

# Batch query: Create NostrUserWotMetricsCard for nodes in ID range
# Using elementId() instead of deprecated id() function
# Removed WHERE NOT clause since MERGE handles create-if-not-exists and constraint prevents duplicates
CYPHER_CREATE_BATCH="MATCH (s:SetOfNostrUserWotMetricsCards)
WHERE toInteger(split(elementId(s), ':')[2]) >= \$minId 
  AND toInteger(split(elementId(s), ':')[2]) < \$maxId
MERGE (s) -[:SPECIFIC_INSTANCE]-> (c:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
SET c.observer_pubkey = '$CUSTOMER_PUBKEY', c.observee_pubkey = s.observee_pubkey
RETURN count(c) as numCards"

echo "$(date): Starting addMetricsCards for customer_id $CUSTOMER_ID"
echo "$(date): Starting addMetricsCards for customer_id $CUSTOMER_ID" >> ${BRAINSTORM_LOG_DIR}/addMetricsCards.log

# Get the ID range of nodes that need cards
echo "$(date): Getting ID range for batching"
echo "$(date): Getting ID range for batching" >> ${BRAINSTORM_LOG_DIR}/addMetricsCards.log

rangeResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER_GET_RANGE")
rangeData=$(echo "$rangeResults" | tail -n +2 | grep -v '^$')

if [[ -z "$rangeData" ]]; then
    echo "$(date): No cards need to be created for customer_id $CUSTOMER_ID"
    echo "$(date): No cards need to be created for customer_id $CUSTOMER_ID" >> ${BRAINSTORM_LOG_DIR}/addMetricsCards.log
    exit 0
fi

# Parse min and max IDs (cypher-shell returns comma-separated values)
minId=$(echo "$rangeData" | cut -d',' -f1 | tr -d ' ')
maxId=$(echo "$rangeData" | cut -d',' -f2 | tr -d ' ')

# Check if minId or maxId are null (no cards need to be created)
if [[ "$minId" == "null" ]] || [[ "$maxId" == "null" ]] || [[ -z "$minId" ]] || [[ -z "$maxId" ]]; then
    echo "$(date): No cards need to be created for customer_id $CUSTOMER_ID (minId=$minId, maxId=$maxId)"
    echo "$(date): No cards need to be created for customer_id $CUSTOMER_ID (minId=$minId, maxId=$maxId)" >> ${BRAINSTORM_LOG_DIR}/addMetricsCards.log
    exit 0
fi

echo "$(date): Processing nodes with IDs from $minId to $maxId"
echo "$(date): Processing nodes with IDs from $minId to $maxId" >> ${BRAINSTORM_LOG_DIR}/addMetricsCards.log

# Process in ID-based batches
totalCards=0
currentId=$minId
batchNum=1

while [[ "$currentId" -le "$maxId" ]]; do
    nextId=$((currentId + BATCH_SIZE))
    
    echo "$(date): Processing batch $batchNum (IDs $currentId to $((nextId-1)))"
    echo "$(date): Processing batch $batchNum (IDs $currentId to $((nextId-1)))" >> ${BRAINSTORM_LOG_DIR}/addMetricsCards.log
    
    # Create cards for this ID range
    batchResult=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" \
        -P "minId=>$currentId" -P "maxId=>$nextId" "$CYPHER_CREATE_BATCH")
    
    # Extract count from result
    batchCount="${batchResult:9}"
    if [[ "$batchCount" =~ ^[0-9]+$ ]]; then
        totalCards=$((totalCards + batchCount))
        echo "$(date): Batch $batchNum: Created $batchCount cards (Total: $totalCards)"
        echo "$(date): Batch $batchNum: Created $batchCount cards (Total: $totalCards)" >> ${BRAINSTORM_LOG_DIR}/addMetricsCards.log
    else
        echo "$(date): Batch $batchNum: No valid count returned"
        echo "$(date): Batch $batchNum: No valid count returned" >> ${BRAINSTORM_LOG_DIR}/addMetricsCards.log
    fi
    
    currentId=$nextId
    batchNum=$((batchNum + 1))
    
    # Small delay to avoid overwhelming Neo4j
    sleep 0.5
done

echo "$(date): Completed addMetricsCards for customer_id $CUSTOMER_ID. Total cards created: $totalCards"
echo "$(date): Completed addMetricsCards for customer_id $CUSTOMER_ID. Total cards created: $totalCards" >> ${BRAINSTORM_LOG_DIR}/addMetricsCards.log