#!/bin/bash

source /etc/brainstorm.conf # BRAINSTORM_LOG_DIR

touch ${BRAINSTORM_LOG_DIR}/calculateVerifiedMuterCounts.log
sudo chown brainstorm:brainstorm ${BRAINSTORM_LOG_DIR}/calculateVerifiedMuterCounts.log

echo "$(date): Starting calculateVerifiedMuterCounts"
echo "$(date): Starting calculateVerifiedMuterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedMuterCounts.log

CYPHER1="
MATCH (f:NostrUser)-[:MUTES]->(u:NostrUser)
WHERE f.influence > 0.1
WITH u, COUNT(f) AS verifiedMuters
SET u.verifiedMuterCount = verifiedMuters
RETURN COUNT(u) AS usersUpdated, SUM(verifiedMuters) AS totalVerifiedMutersSet"

cypherResults=$(sudo cypher-shell -a "$NEO4J_URI" -u "$NEO4J_USER" -p "$NEO4J_PASSWORD" "$CYPHER1")
numUsersUpdated="${cypherResults:11}"
numVerifiedMutersSet="${cypherResults:33}"

echo "$(date): numUsersUpdated: $numUsersUpdated; numVerifiedMutersSet: $numVerifiedMutersSet"
echo "$(date): numUsersUpdated: $numUsersUpdated; numVerifiedMutersSet: $numVerifiedMutersSet" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedMuterCounts.log

echo "$(date): Finished calculateVerifiedMuterCounts"
echo "$(date): Finished calculateVerifiedMuterCounts" >> ${BRAINSTORM_LOG_DIR}/calculateVerifiedMuterCounts.log