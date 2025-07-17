#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateVerifiedFollowerCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateVerifiedFollowerCounts.log

echo "$(date): Starting calculateVerifiedFollowerCounts"
echo "$(date): Starting calculateVerifiedFollowerCounts" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedFollowerCounts.log

CYPHER1="
MATCH (n:NostrUser)<-[f:FOLLOWS]-(m:NostrUser)
WHERE m.influence > 0.1
WITH n, count(f) AS verifiedFollowerCount
SET n.verifiedFollowerCount = verifiedFollowerCount
RETURN COUNT(n) AS numUsersUpdated"

# set verifiedFollowerCount to 0 for users with no verified followers
CYPHER2="
MATCH (n:NostrUser)
OPTIONAL MATCH (n)<-[f:FOLLOWS]-(m:NostrUser)
WHERE m.influence > 0.1
WITH n, count(f) as verifiedFollowerCount
WHERE verifiedFollowerCount = 0
SET n.verifiedFollowerCount = 0
RETURN count(n) AS numUsersUpdated
"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero verifiedFollowerCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero verifiedFollowerCount)" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedFollowerCounts.log

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with zero verifiedFollowerCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with zero verifiedFollowerCount)" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedFollowerCounts.log

echo "$(date): Finished calculateVerifiedFollowerCounts"
echo "$(date): Finished calculateVerifiedFollowerCounts" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedFollowerCounts.log