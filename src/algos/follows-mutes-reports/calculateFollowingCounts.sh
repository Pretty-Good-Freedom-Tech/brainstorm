#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateFollowingCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateFollowingCounts.log

echo "$(date): Starting calculateFollowingCounts"
echo "$(date): Starting calculateFollowingCounts" >> ${BRAINSTORM_LOG_DIR}/calculateFollowingCounts.log

CYPHER1="
MATCH (f:NostrUser)<-[:FOLLOWS]-(u:NostrUser)
WITH u, COUNT(f) AS followingCount
SET u.followingCount = followingCount
RETURN COUNT(u) AS usersUpdated, SUM(followingCount) AS totalFollowingSet"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"
numFollowingSet="${cypherResults:33}"

echo "$(date): numUsersUpdated: $numUsersUpdated; numFollowingSet: $numFollowingSet"
echo "$(date): numUsersUpdated: $numUsersUpdated; numFollowingSet: $numFollowingSet" >> ${BRAINSTORM_LOG_DIR}/calculateFollowingCounts.log

echo "$(date): Finished calculateFollowingCounts"
echo "$(date): Finished calculateFollowingCounts" >> ${BRAINSTORM_LOG_DIR}/calculateFollowingCounts.log