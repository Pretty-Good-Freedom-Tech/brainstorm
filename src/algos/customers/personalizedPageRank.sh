#!/bin/bash

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_OWNER_PUBKEY, BRAINSTORM_LOG_DIR, BRAINSTORM_MODULE_ALGOS_DIR

# Check if customer_pubkey is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <customer_pubkey>"
    exit 1
fi

# Get customer_pubkey
CUSTOMER_PUBKEY="$1"

touch ${BRAINSTORM_LOG_DIR}/personalizedPageRank.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/personalizedPageRank.log

echo "$(date): Starting personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY"
echo "$(date): Starting personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY" >> ${BRAINSTORM_LOG_DIR}/personalizedPageRank.log

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

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1"

echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER1"
echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER1" >> ${BRAINSTORM_LOG_DIR}/personalizedPageRank.log

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2"

echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER2"
echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER2" >> ${BRAINSTORM_LOG_DIR}/personalizedPageRank.log

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3"

echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER3"
echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER3" >> ${BRAINSTORM_LOG_DIR}/personalizedPageRank.log

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER4"

echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER4"
echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER4" >> ${BRAINSTORM_LOG_DIR}/personalizedPageRank.log

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER5"

echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER5"
echo "$(date): Continuing personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY ... finished CYPHER5" >> ${BRAINSTORM_LOG_DIR}/personalizedPageRank.log

echo "$(date): Finished personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY"
echo "$(date): Finished personalizedPageRank for CUSTOMER_PUBKEY: $CUSTOMER_PUBKEY" >> ${BRAINSTORM_LOG_DIR}/personalizedPageRank.log