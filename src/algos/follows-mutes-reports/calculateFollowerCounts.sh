#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateFollowerCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateFollowerCounts.log

echo "$(date): Starting calculateFollowerCounts"
echo "$(date): Starting calculateFollowerCounts" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerCounts.log

CYPHER1="
MATCH (n:NostrUser)<-[f:FOLLOWS]-(m:NostrUser)
WITH n, count(f) AS followerCount
SET n.followerCount = followerCount
RETURN COUNT(n) AS numUsersUpdated"

# set followerCount to 0 for users with no followers
CYPHER2="
MATCH (n:NostrUser)
OPTIONAL MATCH (n)<-[f:FOLLOWS]-(m:NostrUser)
WITH n, count(f) as followerCount
WHERE followerCount = 0
SET n.followerCount = 0
RETURN count(n) AS numUsersUpdated
"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero followerCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero followerCount)" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerCounts.log

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")
numUsersUpdated="${cypherResults:16}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with zero followerCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with zero followerCount)" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerCounts.log

echo "$(date): Finished calculateFollowerCounts"
echo "$(date): Finished calculateFollowerCounts" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerCounts.log