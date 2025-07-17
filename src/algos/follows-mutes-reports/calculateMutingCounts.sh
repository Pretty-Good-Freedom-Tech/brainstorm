#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateMutingCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateMutingCounts.log

echo "$(date): Starting calculateMutingCounts"
echo "$(date): Starting calculateMutingCounts" >> ${BRAINSTORM_LOG_DIR}/calculateMutingCounts.log

CYPHER1="
MATCH (n:NostrUser)-[f:MUTES]->(m:NostrUser)
WITH n, count(f) AS mutingCount
SET n.mutingCount = mutingCount
RETURN COUNT(n) AS numUsersUpdated"

# set mutingCount to NULL for users with no mutes
CYPHER2="
MATCH (n:NostrUser)
OPTIONAL MATCH (n)-[f:MUTES]->(m:NostrUser)
WITH n, count(f) as mutingCount
WHERE mutingCount = 0
SET n.mutingCount = NULL
RETURN count(n) AS numUsersUpdated
"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero mutingCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero mutingCount)" >> ${BRAINSTORM_LOG_DIR}/calculateMutingCounts.log

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")
numUsersUpdated="${cypherResults:11}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with zero mutingCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with zero mutingCount)" >> ${BRAINSTORM_LOG_DIR}/calculateMutingCounts.log

echo "$(date): Finished calculateMutingCounts"
echo "$(date): Finished calculateMutingCounts" >> ${BRAINSTORM_LOG_DIR}/calculateMutingCounts.log