#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateMuterCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateMuterCounts.log

echo "$(date): Starting calculateMuterCounts"
echo "$(date): Starting calculateMuterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateMuterCounts.log

CYPHER1="
MATCH (f:NostrUser)-[:MUTES]->(u:NostrUser)
WITH u, COUNT(f) AS muters
SET u.muterCount = muters
RETURN COUNT(u) AS usersUpdated, SUM(muters) AS totalMutersSet"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"
numMutersSet="${cypherResults:33}"

echo "$(date): numUsersUpdated: $numUsersUpdated; numMutersSet: $numMutersSet"
echo "$(date): numUsersUpdated: $numUsersUpdated; numMutersSet: $numMutersSet" >> ${BRAINSTORM_LOG_DIR}/calculateMuterCounts.log

echo "$(date): Finished calculateMuterCounts"
echo "$(date): Finished calculateMuterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateMuterCounts.log