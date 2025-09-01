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

# Check if customer_pubkey, customer_id, and customer_name are provided
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Usage: $0 <customer_pubkey> <customer_id> <customer_name>"
    exit 1
fi

# Get customer_pubkey
CUSTOMER_PUBKEY="$1"

# Get customer_id
CUSTOMER_ID="$2"

# Get customer_name
CUSTOMER_NAME="$3"  

# Get log directory
LOG_DIR="$BRAINSTORM_LOG_DIR/customers/$CUSTOMER_NAME"

# Create log directory if it doesn't exist; chown to brainstorm user
mkdir -p "$LOG_DIR"
sudo chown brainstorm:brainstorm "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/addMetricsCards.log"

touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

CYPHER_LIMIT=10000
MAX_ITERATIONS=50

CYPHER1="MATCH (s:SetOfNostrUserWotMetricsCards)
WHERE NOT (s) -[:SPECIFIC_INSTANCE]-> (:NostrUserWotMetricsCard {customer_id: $CUSTOMER_ID})
LIMIT $CYPHER_LIMIT
MERGE (s) -[:SPECIFIC_INSTANCE]-> (c:NostrUserWotMetricsCard {observer_pubkey: '$CUSTOMER_PUBKEY', customer_id: $CUSTOMER_ID})
SET c.observee_pubkey = s.observee_pubkey
RETURN count(c) as numCrds"

echo "$(date): Starting addMetricsCards for customer_id $CUSTOMER_ID with customer_pubkey $CUSTOMER_PUBKEY"
echo "$(date): Starting addMetricsCards for customer_id $CUSTOMER_ID with customer_pubkey $CUSTOMER_PUBKEY" >> ${LOG_FILE}

# Iterate CYPHER1 until numCrds is zero or for a maximum of MAX_ITERATIONS iterations
numCrds=1
iterations=1
while [[ "$numCrds" -gt 0 ]] && [[ "$iterations" -lt "$MAX_ITERATIONS" ]]; do
    cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
    numCrds="${cypherResults:8}"
    echo "$(date): numCrds = $numCrds"
    echo "$(date): numCrds = $numCrds" >> ${LOG_FILE}
    sleep 1
    ((iterations++))
done

echo "$(date): Finished addMetricsCards for customer_id $CUSTOMER_ID with customer_pubkey $CUSTOMER_PUBKEY"
echo "$(date): Finished addMetricsCards for customer_id $CUSTOMER_ID with customer_pubkey $CUSTOMER_PUBKEY" >> ${LOG_FILE}
