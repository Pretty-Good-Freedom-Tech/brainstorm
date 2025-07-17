#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateFollowerCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateFollowerCounts.log

echo "$(date): Starting calculateFollowerCounts"
echo "$(date): Starting calculateFollowerCounts" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerCounts.log

CYPHER1="
MATCH (f:NostrUser)-[:FOLLOWS]->(u:NostrUser)
WITH u, COUNT(f) AS followerCount
SET u.followerCount = followerCount
RETURN COUNT(u) AS usersUpdated, SUM(followerCount) AS totalFollowersSet"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"
numFollowersSet="${cypherResults:33}"

echo "$(date): numUsersUpdated: $numUsersUpdated; numFollowersSet: $numFollowersSet"
echo "$(date): numUsersUpdated: $numUsersUpdated; numFollowersSet: $numFollowersSet" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerCounts.log

echo "$(date): Finished calculateFollowerCounts"
echo "$(date): Finished calculateFollowerCounts" >> ${BRAINSTORM_LOG_DIR}/calculateFollowerCounts.log