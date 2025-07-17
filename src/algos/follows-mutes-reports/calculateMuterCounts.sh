#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateMuterCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateMuterCounts.log

echo "$(date): Starting calculateMuterCounts"
echo "$(date): Starting calculateMuterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateMuterCounts.log

CYPHER1="
MATCH (n:NostrUser)<-[f:MUTES]-(m:NostrUser)
WITH n, count(f) AS muterCount
SET n.muterCount = muterCount
RETURN COUNT(n) AS numUsersUpdated"

# set muterCount to 0 for users with no mutes
CYPHER2="
MATCH (n:NostrUser)
OPTIONAL MATCH (n)<-[f:MUTES]-(m:NostrUser)
WITH n, count(f) as muterCount
WHERE muterCount = 0
SET n.muterCount = 0
RETURN count(n) AS numUsersUpdated
"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero muterCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero muterCount)" >> ${BRAINSTORM_LOG_DIR}/calculateMuterCounts.log

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with zero muterCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with zero muterCount)" >> ${BRAINSTORM_LOG_DIR}/calculateMuterCounts.log

echo "$(date): Finished calculateMuterCounts"
echo "$(date): Finished calculateMuterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateMuterCounts.log