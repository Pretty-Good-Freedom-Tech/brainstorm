#!/bin/bash

# This calculates number of hops from scratch starting with CUSTOMER_PUBKEY which by definition is 0 hops away
# The resuls are stored in neo4j in the relevant NostrUserWotMetricsCard nodesusing the property: hops
# This script is called with a command like:
# sudo bash calculateHops.sh <customer_pubkey>

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_LOG_DIR

# Check if customer_pubkey is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <customer_pubkey>"
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

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/calculateHops.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

CYPHER1="MATCH (c:NostrUserWotMetricsCard {observer_pubkey:'$CUSTOMER_PUBKEY'}) SET c.hops=999"
CYPHER2="MATCH (c:NostrUserWotMetricsCard {observer_pubkey:'$CUSTOMER_PUBKEY', observee_pubkey:'$CUSTOMER_PUBKEY'}) SET c.hops=0"
CYPHER3="MATCH (c1:NostrUserWotMetricsCard {observer_pubkey:'$CUSTOMER_PUBKEY'})-[:SPECIFIC_INSTANCE]-(:SetOfNostrUserWotMetricsCards)-[:WOT_METRICS_CARDS]-(u1:NostrUser)-[:FOLLOWS]->(u2:NostrUser)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(c2:NostrUserWotMetricsCard {observer_pubkey:'$CUSTOMER_PUBKEY'}) WHERE c2.hops - c1.hops > 1 SET c2.hops = c1.hops + 1 RETURN count(c2) as numUpdates"

numHops=1

echo "$(date): Starting calculateHops"
echo "$(date): Starting calculateHops" >> ${LOG_FILE}

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2"
cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3")
numUpdates="${cypherResults:11}"

echo "$(date): Continuing calculateHops; numUpdates: $numUpdates numHops: $numHops"
echo "$(date): Continuing calculateHops; numUpdates: $numUpdates numHops: $numHops" >> ${LOG_FILE}

while [[ "$numUpdates" -gt 0 ]] && [[ "$numHops" -lt 12 ]];
do
    ((numHops++))
    cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3")
    numUpdates="${cypherResults:11}"
    echo "$(date): Continuing calculateHops; numUpdates: $numUpdates numHops: $numHops"
    echo "$(date): Continuing calculateHops; numUpdates: $numUpdates numHops: $numHops" >> ${LOG_FILE}
done

echo "$(date): Finished calculateHops for observer_pubkey $CUSTOMER_PUBKEY"
echo "$(date): Finished calculateHops for observer_pubkey $CUSTOMER_PUBKEY" >> ${LOG_FILE}