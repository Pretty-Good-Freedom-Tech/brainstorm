#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_OWNER_PUBKEY, BRAINSTORM_LOG_DIR, BRAINSTORM_MODULE_ALGOS_DIR

# Check if customer_pubkey is provided
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

LOG_DIR="$BRAINSTORM_LOG_DIR/customers/$CUSTOMER_NAME"

# Create log directory if it doesn't exist
mkdir -p "$LOG_DIR"

# Log file
LOG_FILE="$LOG_DIR/personalizedPageRank.log"
touch ${LOG_FILE}
sudo chown brainstorm:brainstorm ${LOG_FILE}

echo "$(date): Starting personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY"
echo "$(date): Starting personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY" >> ${LOG_FILE}

CYPHER1="
MATCH (source:NostrUser)-[r:FOLLOWS]->(target:NostrUser)
RETURN gds.graph.project(
  'personalizedPageRank_$CUSTOMER_PUBKEY',
  source,
  target
)
"

CYPHER2="
MATCH (refUser:NostrUser {pubkey: '$CUSTOMER_PUBKEY'})
CALL gds.pageRank.write('personalizedPageRank_$CUSTOMER_PUBKEY', {
  maxIterations: 20,
  dampingFactor: 0.85,
  scaler: 'MinMax',
  writeProperty: 'customer_personalizedPageRank',
  sourceNodes: [refUser]
})
YIELD nodePropertiesWritten, ranIterations
RETURN nodePropertiesWritten, ranIterations
"

CYPHER3="CALL gds.graph.drop('personalizedPageRank_$CUSTOMER_PUBKEY') YIELD graphName"

# Transfer customer_personalizedPageRank from NostrUser to personalizedPageRank in NostrUserWotMetricsCard
CYPHER4="
MATCH (n:NostrUser)-[:WOT_METRICS_CARDS]->(:SetOfNostrUserWotMetricsCards)-[:SPECIFIC_INSTANCE]->(c:NostrUserWotMetricsCard {observer_pubkey: '$CUSTOMER_PUBKEY'})
WHERE n.customer_personalizedPageRank IS NOT NULL
SET c.personalizedPageRank = n.customer_personalizedPageRank
"

CYPHER5="
MATCH (n:NostrUser)
WHERE n.customer_personalizedPageRank IS NOT NULL
SET n.customer_personalizedPageRank = NULL
"

# no need to send output to log file or console
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1" > /dev/null 2>&1

echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER1"
echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER1" >> ${LOG_FILE}

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2" > /dev/null 2>&1

echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER2"
echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER2" >> ${LOG_FILE}

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3" > /dev/null 2>&1

echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER3"
echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER3" >> ${LOG_FILE}

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER4" > /dev/null 2>&1

echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER4"
echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER4" >> ${LOG_FILE}

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER5" > /dev/null 2>&1

echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER5"
echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER5" >> ${LOG_FILE}

echo "$(date): Finished personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY"
echo "$(date): Finished personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY" >> ${LOG_FILE}