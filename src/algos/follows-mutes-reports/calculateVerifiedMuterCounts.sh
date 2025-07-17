#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateVerifiedMuterCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateVerifiedMuterCounts.log

echo "$(date): Starting calculateVerifiedMuterCounts"
echo "$(date): Starting calculateVerifiedMuterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedMuterCounts.log

CYPHER1="
MATCH (n:NostrUser)<-[f:MUTES]-(m:NostrUser)
WHERE m.influence > 0.1
WITH n, count(f) AS verifiedMuterCount
SET n.verifiedMuterCount = verifiedMuterCount
RETURN COUNT(n) AS numUsersUpdated"

# set verifiedMuterCount to 0 for users with no mutes
CYPHER2="
MATCH (n:NostrUser)
OPTIONAL MATCH (n)<-[f:MUTES]-(m:NostrUser)
WHERE m.influence > 0.1
WITH n, count(f) as verifiedMuterCount
WHERE verifiedMuterCount = 0
SET n.verifiedMuterCount = 0
RETURN count(n) AS numUsersUpdated
"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero verifiedMuterCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero verifiedMuterCount)" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedMuterCounts.log

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with zero verifiedMuterCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with zero verifiedMuterCount)" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedMuterCounts.log

echo "$(date): Finished calculateVerifiedMuterCounts"
echo "$(date): Finished calculateVerifiedMuterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedMuterCounts.log