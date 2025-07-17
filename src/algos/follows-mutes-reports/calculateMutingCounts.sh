#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateMutingCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateMutingCounts.log

echo "$(date): Starting calculateMutingCounts"
echo "$(date): Starting calculateMutingCounts" >> ${BRAINSTORM_LOG_DIR}/calculateMutingCounts.log

CYPHER1="
MATCH (f:NostrUser)<-[:MUTES]-(u:NostrUser)
WITH u, COUNT(f) AS mutingCount
SET u.mutingCount = mutingCount
RETURN COUNT(u) AS usersUpdated, SUM(mutingCount) AS totalMutingSet"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"
numMutingSet="${cypherResults:33}"

echo "$(date): numUsersUpdated: $numUsersUpdated; numMutingSet: $numMutingSet"
echo "$(date): numUsersUpdated: $numUsersUpdated; numMutingSet: $numMutingSet" >> ${BRAINSTORM_LOG_DIR}/calculateMutingCounts.log

echo "$(date): Finished calculateMutingCounts"
echo "$(date): Finished calculateMutingCounts" >> ${BRAINSTORM_LOG_DIR}/calculateMutingCounts.log