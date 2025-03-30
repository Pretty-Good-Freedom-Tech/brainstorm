#!/bin/bash

source /etc/hasenpfeffr.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, HASENPFEFFR_OWNER_PUBKEY, HASENPFEFFR_LOG_DIR, HASENPFEFFR_MODULE_ALGOS_DIR

echo "$(date): Starting calculatePersonalizedPageRank" >> ${HASENPFEFFR_LOG_DIR}/calculatePersonalizedPageRank.log

echo "HASENPFEFFR_OWNER_PUBKEY: $HASENPFEFFR_OWNER_PUBKEY"

CYPHER1="
MATCH (source:NostrUser)-[r:FOLLOWS]->(target:NostrUser)
RETURN gds.graph.project(
  'personalizedPageRank_$HASENPFEFFR_OWNER_PUBKEY',
  source,
  target
)
"

CYPHER2="
MATCH (refUser:NostrUser {pubkey: '$HASENPFEFFR_OWNER_PUBKEY'})
CALL gds.pageRank.write('personalizedPageRank_$HASENPFEFFR_OWNER_PUBKEY', {
  maxIterations: 20,
  dampingFactor: 0.85,
  scaler: 'MinMax',
  writeProperty: 'personalizedPageRank',
  sourceNodes: [refUser]
})
YIELD nodePropertiesWritten, ranIterations
RETURN nodePropertiesWritten, ranIterations
"

CYPHER3="CALL gds.graph.drop('personalizedPageRank_$HASENPFEFFR_OWNER_PUBKEY') YIELD graphName"

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2"
sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3"

# once personalizedPageRank scores are updated in neo4j (above), call the script that updates the plugin whitelist:
sudo ${HASENPFEFFR_MODULE_ALGOS_DIR}/exportWhitelist.sh

echo "$(date): Finished calculatePersonalizedPageRank" >> ${HASENPFEFFR_LOG_DIR}/calculatePersonalizedPageRank.log