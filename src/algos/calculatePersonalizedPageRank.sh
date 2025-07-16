#!/bin/bash
# Calculates personalized PageRank using BRAINSTORM_OWNER_PUBKEY as the reference user
# Results are written to neo4j database and stored in each NostrUser node using the personalizedPageRank property

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_OWNER_PUBKEY, BRAINSTORM_LOG_DIR, BRAINSTORM_MODULE_ALGOS_DIR

touch ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log

echo "$(date): Starting calculatePersonalizedPageRank"
echo "$(date): Starting calculatePersonalizedPageRank" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log

CYPHER1="
MATCH (source:NostrUser)-[r:FOLLOWS]->(target:NostrUser)
RETURN gds.graph.project(
  'personalizedPageRank_$BRAINSTORM_OWNER_PUBKEY',
  source,
  target
)
"

CYPHER2="
MATCH (refUser:NostrUser {pubkey: '$BRAINSTORM_OWNER_PUBKEY'})
CALL gds.pageRank.write('personalizedPageRank_$BRAINSTORM_OWNER_PUBKEY', {
  maxIterations: 20,
  dampingFactor: 0.85,
  scaler: 'MinMax',
  writeProperty: 'personalizedPageRank',
  sourceNodes: [refUser]
})
YIELD nodePropertiesWritten, ranIterations
RETURN nodePropertiesWritten, ranIterations
"

CYPHER3="CALL gds.graph.drop('personalizedPageRank_$BRAINSTORM_OWNER_PUBKEY') YIELD graphName"

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1"

echo "$(date): Continuing calculatePersonalizedPageRank ... finished CYPHER1"
echo "$(date): Continuing calculatePersonalizedPageRank ... finished CYPHER1" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2"

echo "$(date): Continuing calculatePersonalizedPageRank ... finished CYPHER2"
echo "$(date): Continuing calculatePersonalizedPageRank ... finished CYPHER2" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log

sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER3"

echo "$(date): Continuing calculatePersonalizedPageRank ... finished CYPHER3"
echo "$(date): Continuing calculatePersonalizedPageRank ... finished CYPHER3" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log

# once personalizedPageRank scores are updated in neo4j (above), call the script that updates the plugin whitelist:
# sudo ${BRAINSTORM_MODULE_ALGOS_DIR}/exportWhitelist.sh

echo "$(date): Finished calculatePersonalizedPageRank"
echo "$(date): Finished calculatePersonalizedPageRank" >> ${BRAINSTORM_LOG_DIR}/calculatePersonalizedPageRank.log