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

CYPHER1="MATCH (s:Set:SetOfNostrUserWotMetricsCards)
WHERE NOT (s) -[:SPECIFIC_INSTANCE]-> (:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
LIMIT 100000
MERGE (s) -[:SPECIFIC_INSTANCE]-> (c:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
SET c.observer_pubkey = '$CUSTOMER_PUBKEY', c.observee_pubkey = s.observee_pubkey
RETURN count(s) as numSets"

echo "$(date): Starting addMetricsCards for customer_id $CUSTOMER_ID"
echo "$(date): Starting addMetricsCards for customer_id $CUSTOMER_ID" >> ${BRAINSTORM_LOG_DIR}/addMetricsCards.log

# Iterate CYPHER1 until numSets is zero or for a maximum of 20 iterations
numSets=1
iterations=1
while [[ "$numSets" -gt 0 ]] && [[ "$iterations" -lt 20 ]]; do
    cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
    echo "$(date): cypherResults = $cypherResults"
    echo "$(date): cypherResults = $cypherResults" >> ${BRAINSTORM_LOG_DIR}/addMetricsCards.log
    numSets="${cypherResults:8}"
    echo "$(date): numSets = $numSets"
    echo "$(date): numSets = $numSets" >> ${BRAINSTORM_LOG_DIR}/addMetricsCards.log
    sleep 1
    ((iterations++))
done