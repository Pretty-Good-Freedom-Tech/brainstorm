#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateFollowingCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateFollowingCounts.log

echo "$(date): Starting calculateFollowingCounts"
echo "$(date): Starting calculateFollowingCounts" >> ${BRAINSTORM_LOG_DIR}/calculateFollowingCounts.log

CYPHER1="
MATCH (n:NostrUser)-[f:FOLLOWS]->(m:NostrUser)
WITH n, count(f) AS followingCount
SET n.followingCount = followingCount
RETURN COUNT(n) AS numUsersUpdated"

# set followingCount to NULL for users with no follows
CYPHER2="
MATCH (n:NostrUser)
OPTIONAL MATCH (n)-[f:FOLLOWS]->(m:NostrUser)
WITH n, count(f) as followingCount
WHERE followingCount = 0
SET n.followingCount = NULL
RETURN count(n) AS numUsersUpdated
"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero followingCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with nonzero followingCount)" >> ${BRAINSTORM_LOG_DIR}/calculateFollowingCounts.log

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER2")
numUsersUpdated="${cypherResults:11}"

echo "$(date): numUsersUpdated: $numUsersUpdated (with zero followingCount)"
echo "$(date): numUsersUpdated: $numUsersUpdated (with zero followingCount)" >> ${BRAINSTORM_LOG_DIR}/calculateFollowingCounts.log

echo "$(date): Finished calculateFollowingCounts"
echo "$(date): Finished calculateFollowingCounts" >> ${BRAINSTORM_LOG_DIR}/calculateFollowingCounts.log