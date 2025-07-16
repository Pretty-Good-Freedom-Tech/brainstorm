#!/bin/bash
# Calculates personalized PageRank using a supplied pubkey as the reference user
# Results are returned as a JSON object
# This script is used by the API to calculate and return personalized PageRank in real time for a given user
# (i.e. it does not return precalculated results from Neo4j)
# To write results to the neo4j database, use calculatePersonalizedPageRank.sh

source /etc/brainstorm.conf # NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, BRAINSTORM_OWNER_PUBKEY, BRAINSTORM_LOG_DIR, BRAINSTORM_MODULE_ALGOS_DIR

touch ${BRAINSTORM_LOG_DIR}/personalizedPageRankForApi.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/personalizedPageRankForApi.log

REF_PUBKEY=$1

# if no REF_PUBKEY, then set REF_PUBKEY to BRAINSTORM_OWNER_PUBKEY
if [ -z "$REF_PUBKEY" ]; then
    REF_PUBKEY=$BRAINSTORM_OWNER_PUBKEY
fi

echo "$(date): Starting personalizedPageRankForApi"
echo "$(date): Starting personalizedPageRankForApi" >> ${BRAINSTORM_LOG_DIR}/personalizedPageRankForApi.log

CYPHER0="
MATCH (refUser:NostrUser {pubkey: '$REF_PUBKEY'})
CALL gds.pageRank.stream('followsGraph', {
  maxIterations: 20,
  dampingFactor: 0.85,
  scaler: 'MinMax',
  sourceNodes: [refUser]
})
YIELD nodeId, score
WHERE score > 0
ORDER BY score DESC
LIMIT 100
RETURN gds.util.asNode(nodeId).pubkey AS pubkey, score
"

CYPHER0_RESULTS=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER0")
echo "$CYPHER0_RESULTS"

# store CYPHER0_RESULTS in a tmp file; name of file includes pubkey
echo "$CYPHER0_RESULTS" > /tmp/personalizedPageRankForApi_${REF_PUBKEY}.txt

# call javascript file to process CYPHER0_RESULTS into json format
# node /usr/local/bin/convertPersonalizedPageRankForApiToJSON.js ${REF_PUBKEY}

echo "$(date): Continuing personalizedPageRankForApi ... finished CYPHER0"
echo "$(date): Continuing personalizedPageRankForApi ... finished CYPHER0" >> ${BRAINSTORM_LOG_DIR}/personalizedPageRankForApi.log

echo "$(date): Finished personalizedPageRankForApi"
echo "$(date): Finished personalizedPageRankForApi" >> ${BRAINSTORM_LOG_DIR}/personalizedPageRankForApi.log